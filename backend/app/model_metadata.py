"""Machine-readable model card loaded independently from the prediction provider."""

import json
from pathlib import Path

from app.config import ROOT
from app.schemas import ModelMetadataResponse


DEFAULT_PATH = ROOT / "backend" / "data" / "model_metadata.json"


def load_model_metadata(path: Path = DEFAULT_PATH) -> ModelMetadataResponse:
    """Load and validate the model card used by the public metadata endpoint."""
    return ModelMetadataResponse.model_validate_json(path.read_text(encoding="utf-8"))
