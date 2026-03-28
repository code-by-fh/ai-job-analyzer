from logger import get_logger

logger = get_logger(__name__)

import requests
import sys

# Constants
API_URL = "http://localhost:8000"
USERNAME = "admin"
PASSWORD = "admin"  # Default password created by entrypoint


def login():
    try:
        response = requests.post(
            f"{API_URL}/auth/login", data={"username": USERNAME, "password": PASSWORD}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            logger.info(f"Login failed: {response.text}")
            return None
    except Exception as e:
        logger.info(f"Connection error: {e}")
        return None


def verify_settings(token):
    headers = {"Authorization": f"Bearer {token}"}

    # 1. GET Default
    logger.info("\n--- Testing GET Default Settings ---")
    res = requests.get(f"{API_URL}/admin/settings", headers=headers)
    logger.info(f"GET Status: {res.status_code}")
    logger.info(f"GET Payload: {res.json()}")

    if res.status_code != 200:
        logger.error("FAIL: Could not get settings")
        return False

    default_model = res.json().get("openrouter_model")
    if default_model != "tngtech/deepseek-r1t2-chimera:free":
        logger.error(
            f"WARNING: Default model is not expected default (could be already set). Got: {default_model}"
        )
    else:
        logger.info("SUCCESS: Default model matches.")

    # 2. POST Update
    logger.info("\n--- Testing POST Update Settings ---")
    new_model = "test/model:v1"
    res = requests.post(
        f"{API_URL}/admin/settings",
        json={"openrouter_model": new_model},
        headers=headers,
    )
    logger.info(f"POST Status: {res.status_code}")
    logger.info(f"POST Payload: {res.json()}")

    if res.status_code != 200:
        logger.error("FAIL: Could not update settings")
        return False

    if res.json().get("openrouter_model") != new_model:
        logger.error("FAIL: Response did not return updated model")
        return False
    logger.info("SUCCESS: POST update successful.")

    # 3. GET Updated
    logger.info("\n--- Testing GET Updated Settings ---")
    res = requests.get(f"{API_URL}/admin/settings", headers=headers)
    logger.info(f"GET Status: {res.status_code}")
    logger.info(f"GET Payload: {res.json()}")

    if res.json().get("openrouter_model") != new_model:
        logger.error("FAIL: GET did not return updated model")
        return False

    logger.info("SUCCESS: Model persistence verified.")

    # Reset to default
    logger.info("\n--- Resetting to Default ---")
    requests.post(
        f"{API_URL}/admin/settings",
        json={"openrouter_model": "tngtech/deepseek-r1t2-chimera:free"},
        headers=headers,
    )

    return True


if __name__ == "__main__":
    token = login()
    if token:
        success = verify_settings(token)
        if success:
            logger.info("\nVERIFICATION PASSED")
        else:
            logger.error("\nVERIFICATION FAILED")
            sys.exit(1)
    else:
        logger.error("\nVERIFICATION FAILED (Login)")
        sys.exit(1)
