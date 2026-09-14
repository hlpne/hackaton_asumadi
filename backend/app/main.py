import logging
from typing import Annotated

import psycopg
from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html
from pydantic import ValidationError
from starlette.exceptions import HTTPException

from app.catalog import Catalog, MemoryCatalog, PostgresCatalog
from app.config import Settings
from app.predictors.base import Predictor, load_predictor, validate_prediction
from app.schemas import (
    ErrorResponse,
    ForecastRequest,
    ForecastResponse,
    LivenessResponse,
    ReadinessResponse,
    Route,
    RouteStop,
)

logger = logging.getLogger(__name__)


def error(status: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details or []}})


def get_predictor(request: Request) -> Predictor:
    return request.app.state.predictor


def create_app(settings: Settings | None = None, predictor: Predictor | None = None, catalog: Catalog | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    application = FastAPI(
        title=config.app_name, version=config.app_version,
        description="Contract v1. Demo predictions do not represent real passenger counts.",
        docs_url=None, redoc_url=None, servers=[{"url": "."}],
        responses={422: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
                   503: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    )
    application.state.settings = config
    application.state.predictor = predictor if predictor is not None else load_predictor(config.predictor_factory)
    store = catalog if catalog is not None else (PostgresCatalog(config) if config.catalog_backend == "postgres" else MemoryCatalog())

    @application.exception_handler(RequestValidationError)
    async def bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"location": list(item["loc"]), "message": item["msg"], "type": item["type"]} for item in exc.errors()]
        return error(422, "VALIDATION_ERROR", "Invalid request", details)

    @application.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        return error(exc.status_code, "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR", str(exc.detail))

    @application.exception_handler(psycopg.Error)
    async def database_error(_: Request, exc: psycopg.Error) -> JSONResponse:
        logger.error("Database unavailable: %s", type(exc).__name__)
        return error(503, "DATABASE_UNAVAILABLE", "Catalog database is unavailable")

    @application.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled application error: %s", type(exc).__name__)
        return error(500, "INTERNAL_ERROR", "Unexpected server error")

    def ensure_route(route_id: str) -> None:
        if not any(item.id == route_id for item in store.routes()):
            raise HTTPException(404, "Route not found")

    @application.get("/docs", include_in_schema=False)
    def swagger():
        # Relative paths work both on :8000/docs and behind the /api proxy.
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
        """Process liveness; does not contact external dependencies."""
        return liveness_payload()

    @application.get("/health/ready", response_model=ReadinessResponse, tags=["health"])
    def health_ready() -> dict:
        """Readiness probe; verifies PostgreSQL when the PostgreSQL catalog is enabled."""
        return readiness_payload()

    @application.get("/health", response_model=ReadinessResponse, tags=["health"])
    def health() -> dict:
        """Backward-compatible readiness endpoint required by the MVP contract."""
        return readiness_payload()

    @application.get("/routes", response_model=list[Route], tags=["catalog"])
    def routes() -> list[Route]:
        return store.routes()

    @application.get("/routes/{route_id}/stops", response_model=list[RouteStop], tags=["catalog"])
    def stops(route_id: str) -> list[RouteStop]:
        ensure_route(route_id)
        return store.stops(route_id)

    @application.get("/forecast", response_model=ForecastResponse, tags=["forecast"])
    def forecast(query: Annotated[ForecastRequest, Query()], provider: Annotated[Predictor, Depends(get_predictor)]) -> ForecastResponse | JSONResponse:
        ensure_route(query.route_id)
        route_stops = store.stops(query.route_id)
        if query.direction_id is not None:
            route_stops = [item for item in route_stops if item.direction_id == query.direction_id]
            if not route_stops:
                raise HTTPException(404, "Direction not found on this route")
        if query.stop_id is not None and not any(item.id == query.stop_id for item in route_stops):
            raise HTTPException(404, "Stop not found on the selected route/direction")
        try:
            return validate_prediction(query, provider.predict(query))
        except (ValidationError, ValueError, TypeError, AttributeError):
            logger.error("Predictor violated the forecast contract")
            return error(502, "INVALID_PREDICTION", "Predictor returned an invalid forecast")
        except Exception as exc:
            logger.error("Predictor failed: %s", type(exc).__name__)
            return error(503, "PREDICTOR_UNAVAILABLE", "Prediction provider is unavailable")

    return application


app = create_app()
