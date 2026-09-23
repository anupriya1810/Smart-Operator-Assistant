"""
Synthetic Data Generation Hook (Pluggable Placeholder)

NOTICE: As specified in Section 5 & 7 of the CAT Co-Pilot specification:
- Synthetic data generation is explicitly NOT performed during this initial build.
- The schema, models, and interfaces are established to accommodate synthetic streams seamlessly.
- Use this hook class to plug in Faker, CTGAN, or stochastic timeseries simulators in future phases.
"""

from typing import List, Dict, Any

class SyntheticDataGeneratorHook:
    """
    Pluggable contract for synthetic telemetry, task streams, and machine wear models.
    """
    def __init__(self):
        self.is_active = False

    def generate_telemetry_batch(self, machine_id: str, operator_id: str, count: int = 10) -> List[Dict[str, Any]]:
        # TODO: Implement synthetic time-series generator (Engine hours, fuel consumption, jittered idle intervals)
        raise NotImplementedError("Synthetic telemetry generation is marked as future work. Real/seeded fixtures are used.")

    def generate_random_tasks(self, count: int = 5) -> List[Dict[str, Any]]:
        # TODO: Implement synthetic task workload generator with realistic weather and location zones
        raise NotImplementedError("Synthetic task generation is marked as future work. Real/seeded fixtures are used.")

synthetic_data_hook = SyntheticDataGeneratorHook()
