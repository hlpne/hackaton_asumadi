"""Train a tiny synthetic CatBoost and save both .cbm and .pkl for acceptance.

Run from the repository root: python backend/scripts/build_example_model.py
No external dataset is downloaded. This does not measure forecasting quality.
"""

import argparse
from datetime import datetime, timedelta
from pathlib import Path
import pickle
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.predictors.artifact import ArtifactMetadata, CAT_FEATURES, FEATURE_NAMES, feature_rows
from app.predictors.mock import MockPredictor
from app.schemas import ForecastRequest, Horizon, MOSCOW, add_months


def build_example(output: Path) -> None:
    from catboost import CatBoostRegressor, Pool

    rows, labels = [], []
    mock = MockPredictor()
    for route_id in ("demo-17", "demo-39", "demo-7"):
        for stop_id in (None, f"{route_id}-s01"):
            for direction in (None, 0, 1):
                for horizon in Horizon:
                    for offset in range(7):
                        start = datetime(2026, 9, 1, tzinfo=MOSCOW)
                        if horizon == Horizon.YEAR:
                            start = add_months(start, offset)
                            end = add_months(start, 1)
                        else:
                            start += timedelta(days=offset)
                            end = start + timedelta(days=1)
                        request = ForecastRequest(
                            route_id=route_id, stop_id=stop_id,
                            direction_id=direction, horizon=horizon,
                            start=start, end=end,
                        )
                        rows.extend(feature_rows(request))
                        labels.extend(point.predicted_load for point in mock.predict(request).points)
    model = CatBoostRegressor(
        iterations=40, depth=4, random_seed=42, thread_count=1,
        loss_function="RMSE", verbose=False, allow_writing_files=False,
    )
    model.fit(Pool(rows, label=labels, cat_features=CAT_FEATURES, feature_names=FEATURE_NAMES))
    output.mkdir(parents=True, exist_ok=True)
    model.save_model(str(output / "example.cbm"), format="cbm")
    with (output / "example.pkl").open("wb") as stream:
        pickle.dump(model, stream, protocol=5)
    metadata = ArtifactMetadata(
        feature_schema="tram-calendar-v1", model_version="catboost-example-v1",
        value_unit="demo_index", aggregation="demo_mean", is_mock=True,
        supported_horizons=list(Horizon),
    )
    (output / "example.metadata.json").write_text(
        metadata.model_dump_json(indent=2) + "\n", encoding="utf-8",
    )
    print(f"EXAMPLE_MODEL_OK: {output.resolve()} ({len(rows)} synthetic training rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "models")
    build_example(parser.parse_args().output)
