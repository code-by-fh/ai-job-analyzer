from logger import get_logger

logger = get_logger(__name__)

from logger import get_logger

logger = get_logger(__name__)

import requests
import sys

API_URL = "http://localhost:8002"


def main():
    logger.info("--- Verifying Password Change ---")

    # 1. Login Admin
    logger.info("[1] Login Admin (Default)...")
    resp = requests.post(
        f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"}
    )
    if resp.status_code != 200:
        logger.error(f"FAILED to login admin: {resp.text}")
        return
    token = resp.json()["access_token"]
    logger.info("    Logged in.")

    # 2. Change Password
    logger.info("[2] Changing Password to 'newpass'...")
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(
        f"{API_URL}/auth/change-password",
        json={"current_password": "admin", "new_password": "newpass"},
        headers=headers,
    )

    if resp.status_code != 200:
        logger.error(f"FAILED to change password: {resp.text}")
        return
    logger.info("    Password changed.")

    # 3. Verify Old Login Fails
    logger.info("[3] Verifying Old Password Fails...")
    resp = requests.post(
        f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"}
    )
    if resp.status_code == 401:
        logger.info("    SUCCESS: Old password rejected.")
    else:
        logger.error(
            f"    FAILED: Old password still works or other error! Code: {resp.status_code}"
        )

    # 4. Verify New Login Works
    logger.info("[4] Verifying New Password Works...")
    resp = requests.post(
        f"{API_URL}/auth/login", data={"username": "admin", "password": "newpass"}
    )
    if resp.status_code == 200:
        logger.info("    SUCCESS: New password accepted.")
    else:
        logger.error(f"    FAILED: New password rejected! {resp.text}")

    # 5. Revert Password (Cleanup)
    logger.info("[5] Reverting Password to 'admin'...")
    new_token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {new_token}"}
    resp = requests.post(
        f"{API_URL}/auth/change-password",
        json={"current_password": "newpass", "new_password": "admin"},
        headers=headers,
    )
    if resp.status_code == 200:
        logger.info("    Cleanup successful.")
    else:
        logger.error("    Cleanup FAILED.")


if __name__ == "__main__":
    main()
