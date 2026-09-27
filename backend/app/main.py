from datetime import UTC, datetime
import json
import logging
import secrets
from typing import Annotated

import psycopg
from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.exceptions import HTTPException

from app.auth import Authenticator, AuthError, Dispatcher, TooManyAttemptsError, load_dispatchers
from app.catalog import Catalog, MemoryCatalog, PostgresCatalog
from app.config import ROOT, Settings
from app.forecast_persistence import (
    DisabledForecastRepository,
    ForecastPersistenceDisabledError,
    ForecastPersistenceResult,
    ForecastRepository,
    ModelRunConflictError,
    PostgresForecastRepository,
)
from app.forecast_service import (
    InvalidPredictionError,
    PredictorUnavailableError,
    predict,
    snapshot,
    top_overload,
)
from app.model_metadata import load_model_metadata
from app.predictors.base import Predictor, load_predictor
from app.schemas import (
    DispatcherProfile,
    ErrorResponse,
    ForecastRequest,
    ForecastResponse,
    LivenessResponse,
    LoginRequest,
    LoginResponse,
    MapForecastResponse,
    ModelMetadataResponse,
    ReadinessResponse,
    Route,
    RouteStop,
    SessionResponse,
    SnapshotRequest,
    TopOverloadRequest,
    TopOverloadResponse,
)

logger = logging.getLogger(__name__)


HTTP_ERROR_CODES = {401: "UNAUTHORIZED", 404: "NOT_FOUND", 429: "TOO_MANY_ATTEMPTS"}
bearer_scheme = HTTPBearer(auto_error=False, description="Token from POST /auth/login")


def error(
    status: int, code: str, message: str, details: list | None = None, headers: dict | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or []}},
        headers=headers,
    )


def get_predictor(request: Request) -> Predictor:
    return request.app.state.predictor


def create_app(
    settings: Settings | None = None,
    predictor: Predictor | None = None,
    catalog: Catalog | None = None,
    forecast_repository: ForecastRepository | None = None,
) -> FastAPI:
    config = settings or Settings.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    application = FastAPI(
        title=config.app_name, version=config.app_version,
        description="Contract v1. Demo predictions do not represent real passenger counts.",
        docs_url=None, redoc_url=None, servers=[{"url": "."}],
        responses={422: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 401: {"model": ErrorResponse},
                   409: {"model": ErrorResponse}, 503: {"model": ErrorResponse},
                   502: {"model": ErrorResponse}},
    )
    application.state.settings = config
    application.state.predictor = predictor if predictor is not None else load_predictor(config.predictor_factory)
    store = catalog if catalog is not None else (
        PostgresCatalog(config) if config.catalog_backend == "postgres" else MemoryCatalog()
    )
    writer = forecast_repository or (
        PostgresForecastRepository(config)
        if config.catalog_backend == "postgres"
        else DisabledForecastRepository()
    )
    authenticator = Authenticator(
        load_dispatchers(config.auth_users_file),
        # Without a configured key tokens are valid only until the process restarts.
        config.auth_secret_key or secrets.token_urlsafe(32),
        config.auth_token_ttl_seconds,
    )
    application.state.authenticator = authenticator
    if config.auth_enabled and not authenticator.dispatchers:
        logger.warning("Auth is enabled but %s has no dispatcher accounts", config.auth_users_file)
    geometry_data = json.loads((ROOT / "mock_data" / "osm_trams.json").read_text(encoding="utf-8"))
    model_metadata = load_model_metadata()

    @application.exception_handler(RequestValidationError)
    async def bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"location": list(item["loc"]), "message": item["msg"], "type": item["type"]} for item in exc.errors()]
        return error(422, "VALIDATION_ERROR", "Invalid request", details)

    @application.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        code = HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
        return error(exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))

    @application.exception_handler(psycopg.Error)
    async def database_error(_: Request, exc: psycopg.Error) -> JSONResponse:
        logger.error("Database unavailable: %s", type(exc).__name__)
        return error(503, "DATABASE_UNAVAILABLE", "Catalog database is unavailable")

    @application.exception_handler(InvalidPredictionError)
    async def invalid_prediction(_: Request, __: InvalidPredictionError) -> JSONResponse:
        return error(502, "INVALID_PREDICTION", "Predictor returned an invalid forecast")

    @application.exception_handler(PredictorUnavailableError)
    async def predictor_unavailable(_: Request, __: PredictorUnavailableError) -> JSONResponse:
        return error(503, "PREDICTOR_UNAVAILABLE", "Prediction provider is unavailable")

    @application.exception_handler(ForecastPersistenceDisabledError)
    async def persistence_disabled(_: Request, __: ForecastPersistenceDisabledError) -> JSONResponse:
        return error(503, "PERSISTENCE_DISABLED", "Forecast persistence requires PostgreSQL")

    @application.exception_handler(ModelRunConflictError)
    async def model_run_conflict(_: Request, __: ModelRunConflictError) -> JSONResponse:
        return error(409, "MODEL_VERSION_CONFLICT", "Model version metadata conflicts with model_runs")

    @application.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled application error: %s", type(exc).__name__)
        return error(500, "INTERNAL_ERROR", "Unexpected server error")

    def current_dispatcher(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ) -> tuple[Dispatcher, int]:
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(401, "Требуется авторизация", headers={"WWW-Authenticate": "Bearer"})
        try:
            return authenticator.verify(credentials.credentials)
        except AuthError as exc:
            raise HTTPException(401, str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc

    def require_dispatcher(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ) -> None:
        if config.auth_enabled:
            current_dispatcher(credentials)

    protected = [Depends(require_dispatcher)]

    def session_payload(dispatcher: Dispatcher, expires_at: int) -> dict:
        return {
            "user": DispatcherProfile(login=dispatcher.login, full_name=dispatcher.full_name),
            "expires_at": datetime.fromtimestamp(expires_at, UTC),
        }

    def ensure_route(route_id: str) -> None:
        if not any(item.id == route_id for item in store.routes()):
            raise HTTPException(404, "Route not found")

    def validate_series(query: ForecastRequest, *, resolve_direction: bool = False) -> None:
        ensure_route(query.route_id)
        route_stops = store.stops(query.route_id)
        if query.direction_id is not None:
            route_stops = [item for item in route_stops if item.direction_id == query.direction_id]
            if not route_stops:
                raise HTTPException(404, "Direction not found on this route")
        if query.stop_id is not None:
            matching_stops = [item for item in route_stops if item.id == query.stop_id]
            if not matching_stops:
                raise HTTPException(404, "Stop not found on the selected route/direction")
            if resolve_direction and query.direction_id is None:
                directions = {item.direction_id for item in matching_stops}
                if len(directions) != 1:
                    raise HTTPException(422, "direction_id is required for an ambiguous route stop")
                query.direction_id = directions.pop()

    @application.get("/docs", include_in_schema=False)
    def swagger():
        return get_swagger_ui_html(openapi_url="./openapi.json", title="Transport API")

    def liveness_payload() -> dict:
        return {
            "status": "ok",
            "service": config.app_name,
            "version": config.app_version,
            "environment": config.app_environment,
        }

    def readiness_payload() -> dict:
        return {
            **liveness_payload(),
            "catalog_backend": config.catalog_backend,
            "database": store.ping(),
        }

    @application.get("/health/live", response_model=LivenessResponse, tags=["health"])
    def health_live() -> dict:
        return liveness_payload()

    @application.get("/health/ready", response_model=ReadinessResponse, tags=["health"])
    def health_ready() -> dict:
        return readiness_payload()

    @application.get("/health", response_model=ReadinessResponse, tags=["health"])
    def health() -> dict:
        return readiness_payload()

    @application.post("/auth/login", response_model=LoginResponse, tags=["auth"])
    def auth_login(credentials: LoginRequest) -> dict:
        """Exchange a dispatcher login and password for a bearer token."""
        try:
            dispatcher, token, expires_at = authenticator.login(credentials.login, credentials.password)
        except TooManyAttemptsError as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": str(exc.retry_after)}) from exc
        except AuthError as exc:
            raise HTTPException(401, str(exc)) from exc
        logger.info("Dispatcher logged in: %s", dispatcher.login)
        return {**session_payload(dispatcher, expires_at), "access_token": token}

    @application.get("/auth/me", response_model=SessionResponse, tags=["auth"])
    def auth_me(session: Annotated[tuple[Dispatcher, int], Depends(current_dispatcher)]) -> dict:
        return session_payload(*session)

    @application.get("/routes", response_model=list[Route], tags=["catalog"], dependencies=protected)
    def routes() -> list[Route]:
        return store.routes()

    @application.get("/model/metadata", response_model=ModelMetadataResponse, tags=["model"], dependencies=protected)
    def model_card() -> ModelMetadataResponse:
        """Validated model-card data consumed by the frontend; no metrics are hardcoded in React."""
        return model_metadata

    @application.get("/routes/{route_id}/stops", response_model=list[RouteStop], tags=["catalog"], dependencies=protected)
    def stops(route_id: str) -> list[RouteStop]:
        ensure_route(route_id)
        return store.stops(route_id)

    @application.get("/routes/{route_id}/geometry", tags=["catalog"], dependencies=protected)
    def route_geometry(route_id: str, direction_id: Annotated[int, Query(ge=0, le=1)] = 0) -> dict:
        """OSM track geometry, distinct from the synthetic load forecast."""
        ensure_route(route_id)
        route = next((item for item in geometry_data["routes"] if item["id"] == route_id), None)
        if route is None:
            raise HTTPException(404, "Route geometry not found")
        direction = route["directions"][direction_id]
        return {
            "route_id": route_id,
            "direction_id": direction_id,
            "source": geometry_data["source"],
            "license": geometry_data["license"],
            "attribution_url": geometry_data["attribution_url"],
            "osm_relation_id": direction["relation_id"],
            "lines": direction["lines"],
        }

    @application.get("/forecast", response_model=ForecastResponse, tags=["forecast"], dependencies=protected)
    def forecast(
        query: Annotated[ForecastRequest, Query()],
        provider: Annotated[Predictor, Depends(get_predictor)],
    ) -> ForecastResponse:
        validate_series(query)
        return predict(provider, query)

    @application.post("/forecast", response_model=ForecastPersistenceResult, tags=["forecast"], dependencies=protected)
    def persist_forecast(
        query: ForecastRequest,
        provider: Annotated[Predictor, Depends(get_predictor)],
    ) -> ForecastPersistenceResult:
        """Compute, validate and atomically upsert one forecast series into PostgreSQL."""
        validate_series(query, resolve_direction=True)
        return writer.save(predict(provider, query))

    @application.get("/forecast/map", response_model=MapForecastResponse, tags=["forecast"], dependencies=protected)
    def forecast_map(
        query: Annotated[SnapshotRequest, Query()],
        provider: Annotated[Predictor, Depends(get_predictor)],
    ) -> MapForecastResponse:
        try:
            return snapshot(store, provider, query)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    @application.get("/forecast/top-overload", response_model=TopOverloadResponse, tags=["forecast"], dependencies=protected)
    def forecast_top_overload(
        query: Annotated[TopOverloadRequest, Query()],
        provider: Annotated[Predictor, Depends(get_predictor)],
    ) -> TopOverloadResponse:
        try:
            return top_overload(snapshot(store, provider, query), query.limit)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    return application


app = create_app()
