"""Minimal, rate-limited FatSecret Platform API client (OAuth 2.0).

Scope is deliberately tiny: authenticate, search foods, fetch one food's detail.
We pull a small curated slice, never the whole database — see the README and the
FatSecret T&Cs on caching/redistribution.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

TOKEN_URL = "https://oauth.fatsecret.com/connect/token"
API_URL = "https://platform.fatsecret.com/rest/server.api"

# Be a good citizen: throttle every outbound call.
MIN_SECONDS_BETWEEN_CALLS = 0.5


@dataclass
class FatSecretClient:
    client_id: str
    client_secret: str
    _token: str | None = None
    _last_call: float = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call
        if elapsed < MIN_SECONDS_BETWEEN_CALLS:
            time.sleep(MIN_SECONDS_BETWEEN_CALLS - elapsed)
        self._last_call = time.monotonic()

    def authenticate(self) -> str:
        """Client-credentials grant. Caches the token on the instance."""
        resp = requests.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials", "scope": "basic"},
            auth=(self.client_id, self.client_secret),
            timeout=30,
        )
        resp.raise_for_status()
        self._token = resp.json()["access_token"]
        return self._token

    def _get(self, params: dict[str, str], retries: int = 5) -> dict[str, Any]:
        if self._token is None:
            self.authenticate()
        last_error: Exception | None = None
        for attempt in range(retries):
            self._throttle()
            try:
                resp = requests.get(
                    API_URL,
                    params={**params, "format": "json"},
                    headers={"Authorization": f"Bearer {self._token}"},
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                if "error" in data:
                    # e.g. code 21 (IP allowlist still propagating) is transient.
                    raise RuntimeError(f"FatSecret API error: {data['error']}")
                return data
            except (requests.RequestException, RuntimeError) as err:
                last_error = err
                time.sleep(1.5 * (attempt + 1))
        assert last_error is not None
        raise last_error

    def search_foods(self, expression: str, max_results: int = 5) -> list[dict[str, Any]]:
        data = self._get(
            {
                "method": "foods.search",
                "search_expression": expression,
                "max_results": str(max_results),
            }
        )
        foods = data.get("foods", {}).get("food", [])
        return foods if isinstance(foods, list) else [foods]

    def get_food(self, food_id: str) -> dict[str, Any]:
        """food.get.v4 — full detail including servings with per-serving nutrition."""
        return self._get({"method": "food.get.v4", "food_id": str(food_id)})
