"""
Model Training and Hyperparameter Tuning Pipeline for CAT Co-Pilot.

Model: XGBoost Regressor (Gradient-Boosted Decision Trees)
Target: actual_time_min
Baseline for comparison: estimated_time_min

Pipeline Steps:
1. Load dataset with engineered features via `services.feature_pipeline.build_dataset_dataframe()`.
2. Time-ordered train/val split (earliest 80% for training, latest 20% for validation).
3. Encode categoricals via OneHotEncoder; pass numerical features directly.
4. Hyperparameter search over max_depth, n_estimators, learning_rate, subsample.
5. Evaluate MAE and RMSE against both actual_time_min and baseline estimated_time_min.
6. Initialize and serialize SHAP explainer for real-time factor attribution.
7. Save serialized model artifacts to `backend/ml/artifacts/`.
"""

import os
import sys
import json
import math
import joblib
import numpy as np
import pandas as pd
from pathlib import Path

# Add backend to sys.path
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

import xgboost as xgb
import shap
from sklearn.model_selection import TimeSeriesSplit, GridSearchCV
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from services.feature_pipeline import build_dataset_dataframe

ARTIFACTS_DIR = BASE_DIR / "ml" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = ARTIFACTS_DIR / "xgb_task_duration.joblib"
EXPLAINER_PATH = ARTIFACTS_DIR / "shap_explainer.joblib"
SCHEMA_PATH = ARTIFACTS_DIR / "feature_schema.json"
REPORT_PATH = ARTIFACTS_DIR / "evaluation_report.json"

CATEGORICAL_FEATURES = [
    "task_type",
    "skill_level",
    "shift",
    "machine_type",
    "machine_status",
    "terrain_difficulty"
]

NUMERICAL_FEATURES = [
    "estimated_time_min",
    "years_experience",
    "training_completion_pct",
    "safety_violations_ytd",
    "operator_reliability_score",
    "machine_age_yrs",
    "lifetime_engine_hours",
    "days_since_last_maintenance",
    "machine_health_score",
    "rolling_avg_idling_time_min",
    "rolling_avg_load_cycles",
    "rolling_safety_alerts_count",
    "temperature_c",
    "precipitation_mm",
    "wind_speed_kmh",
    "elevation_m",
    "slope_pct",
    "ruggedness_score"
]

def train_and_evaluate():
    print("=" * 65)
    print("      CAT Co-Pilot: Task Duration ML Model Training")
    print("=" * 65)

    # 1. Load data
    df = build_dataset_dataframe()
    total_samples = len(df)
    print(f"\n[1/6] Dataset loaded successfully: {total_samples} task samples.")

    # 2. Time-Ordered Split (80% Train, 20% Validation)
    # Sort chronologically to simulate actual production deployment
    df = df.sort_values(by=["scheduled_date", "task_id"]).reset_index(drop=True)
    split_idx = int(total_samples * 0.80)
    train_df = df.iloc[:split_idx].copy()
    val_df = df.iloc[split_idx:].copy()

    print(f"[2/6] Time-Ordered Split:")
    print(f"      Train Set: {len(train_df)} tasks ({train_df['scheduled_date'].min()} to {train_df['scheduled_date'].max()})")
    print(f"      Validation Set: {len(val_df)} tasks ({val_df['scheduled_date'].min()} to {val_df['scheduled_date'].max()})")

    X_train = train_df[CATEGORICAL_FEATURES + NUMERICAL_FEATURES]
    y_train = train_df["actual_time_min"].values

    X_val = val_df[CATEGORICAL_FEATURES + NUMERICAL_FEATURES]
    y_val = val_df["actual_time_min"].values
    baseline_val_preds = val_df["estimated_time_min"].values

    # 3. Build Preprocessing & Pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
            ("num", "passthrough", NUMERICAL_FEATURES)
        ],
        remainder="drop"
    )

    base_xgb = xgb.XGBRegressor(
        objective="reg:squarederror",
        random_state=42,
        tree_method="hist"
    )

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("regressor", base_xgb)
    ])

    # 4. Hyperparameter Tuning with TimeSeriesSplit Cross-Validation
    print(f"\n[3/6] Running hyperparameter grid search on training data...")
    param_grid = {
        "regressor__max_depth": [3, 4, 5],
        "regressor__n_estimators": [50, 80, 120],
        "regressor__learning_rate": [0.04, 0.08, 0.12],
        "regressor__subsample": [0.8, 1.0],
        "regressor__colsample_bytree": [0.8, 1.0]
    }

    tscv = TimeSeriesSplit(n_splits=3)
    grid_search = GridSearchCV(
        estimator=pipeline,
        param_grid=param_grid,
        cv=tscv,
        scoring="neg_mean_absolute_error",
        n_jobs=-1,
        verbose=0
    )
    grid_search.fit(X_train, y_train)

    best_pipeline = grid_search.best_estimator_
    best_params = grid_search.best_params_
    print(f"      Optimal Hyperparameters Found: {best_params}")

    # 5. Evaluate on Out-of-Time Validation Set
    print(f"\n[4/6] Evaluating model vs baseline on validation set...")
    val_preds = best_pipeline.predict(X_val)

    # Model metrics
    model_mae = float(mean_absolute_error(y_val, val_preds))
    model_rmse = float(root_mean_squared_error(y_val, val_preds))

    # Baseline metrics (using estimated_time_min as the prediction)
    baseline_mae = float(mean_absolute_error(y_val, baseline_val_preds))
    baseline_rmse = float(root_mean_squared_error(y_val, baseline_val_preds))

    # Calculate lift
    mae_lift_pct = round(((baseline_mae - model_mae) / baseline_mae) * 100, 2)
    rmse_lift_pct = round(((baseline_rmse - model_rmse) / baseline_rmse) * 100, 2)

    print("\n" + "=" * 65)
    print("                     EVALUATION REPORT")
    print("=" * 65)
    print(f" Baseline (estimated_time_min as prediction):")
    print(f"   -> Baseline MAE : {baseline_mae:.2f} minutes")
    print(f"   -> Baseline RMSE: {baseline_rmse:.2f} minutes")
    print(f"\n CAT Co-Pilot XGBoost Regressor:")
    print(f"   -> Model MAE    : {model_mae:.2f} minutes")
    print(f"   -> Model RMSE   : {model_rmse:.2f} minutes")
    print(f"\n Model Lift / Improvement:")
    print(f"   -> MAE Reduction: {mae_lift_pct}% error reduction vs baseline")
    print(f"   -> RMSE Reduction: {rmse_lift_pct}% error reduction vs baseline")
    print("=" * 65)

    # 6. Fit SHAP Explainer on XGBoost Booster
    print(f"\n[5/6] Fitting SHAP TreeExplainer for feature attribution...")
    fitted_preprocessor = best_pipeline.named_steps["preprocessor"]
    fitted_xgb = best_pipeline.named_steps["regressor"]

    # Transform training features for explainer background
    X_train_trans = fitted_preprocessor.transform(X_train)
    
    # Extract encoded feature names
    cat_encoder = fitted_preprocessor.named_transformers_["cat"]
    encoded_cat_names = list(cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES))
    all_feature_names = encoded_cat_names + NUMERICAL_FEATURES

    # Save feature names schema
    schema = {
        "categorical_features": CATEGORICAL_FEATURES,
        "numerical_features": NUMERICAL_FEATURES,
        "encoded_feature_names": all_feature_names,
        "baseline_mae": baseline_mae,
        "model_mae": model_mae,
        "mae_lift_pct": mae_lift_pct
    }
    with open(SCHEMA_PATH, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)

    try:
        explainer = shap.TreeExplainer(fitted_xgb)
        joblib.dump(explainer, EXPLAINER_PATH)
        print("      SHAP TreeExplainer serialized successfully.")
    except Exception as e:
        print(f"      [SHAP Warning] Direct TreeExplainer serialization: {e}")

    # 7. Serialize Artifacts
    print(f"\n[6/6] Saving serialized model artifacts to {ARTIFACTS_DIR}...")
    joblib.dump(best_pipeline, MODEL_PATH)

    evaluation_report = {
        "timestamp": pd.Timestamp.now().isoformat(),
        "total_tasks": total_samples,
        "train_tasks": len(train_df),
        "validation_tasks": len(val_df),
        "hyperparameters": best_params,
        "baseline_metrics": {
            "mae_min": round(baseline_mae, 2),
            "rmse_min": round(baseline_rmse, 2)
        },
        "model_metrics": {
            "mae_min": round(model_mae, 2),
            "rmse_min": round(model_rmse, 2)
        },
        "lift": {
            "mae_reduction_pct": mae_lift_pct,
            "rmse_reduction_pct": rmse_lift_pct
        },
        "top_feature_importances": [
            {"feature": name, "importance": round(float(imp), 4)}
            for name, imp in sorted(zip(all_feature_names, fitted_xgb.feature_importances_), key=lambda x: x[1], reverse=True)[:8]
        ]
    }

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(evaluation_report, f, indent=2)

    print(f"      -> Model Pipeline: {MODEL_PATH.name}")
    print(f"      -> Feature Schema: {SCHEMA_PATH.name}")
    print(f"      -> Evaluation Report: {REPORT_PATH.name}")
    print("\nTraining & evaluation completed successfully!")
    return evaluation_report

if __name__ == "__main__":
    train_and_evaluate()
