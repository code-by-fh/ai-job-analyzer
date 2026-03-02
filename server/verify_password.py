import requests
import sys

API_URL = "http://localhost:8002"

def main():
    print("--- Verifying Password Change ---")
    
    # 1. Login Admin
    print("[1] Login Admin (Default)...")
    resp = requests.post(f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"})
    if resp.status_code != 200:
        print(f"FAILED to login admin: {resp.text}")
        return
    token = resp.json()["access_token"]
    print("    Logged in.")

    # 2. Change Password
    print("[2] Changing Password to 'newpass'...")
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{API_URL}/auth/change-password", json={"current_password": "admin", "new_password": "newpass"}, headers=headers)
    
    if resp.status_code != 200:
        print(f"FAILED to change password: {resp.text}")
        return
    print("    Password changed.")

    # 3. Verify Old Login Fails
    print("[3] Verifying Old Password Fails...")
    resp = requests.post(f"{API_URL}/auth/login", data={"username": "admin", "password": "admin"})
    if resp.status_code == 401:
        print("    SUCCESS: Old password rejected.")
    else:
        print(f"    FAILED: Old password still works or other error! Code: {resp.status_code}")

    # 4. Verify New Login Works
    print("[4] Verifying New Password Works...")
    resp = requests.post(f"{API_URL}/auth/login", data={"username": "admin", "password": "newpass"})
    if resp.status_code == 200:
        print("    SUCCESS: New password accepted.")
    else:
        print(f"    FAILED: New password rejected! {resp.text}")

    # 5. Revert Password (Cleanup)
    print("[5] Reverting Password to 'admin'...")
    new_token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {new_token}"}
    resp = requests.post(f"{API_URL}/auth/change-password", json={"current_password": "newpass", "new_password": "admin"}, headers=headers)
    if resp.status_code == 200:
        print("    Cleanup successful.")
    else:
        print("    Cleanup FAILED.")

if __name__ == "__main__":
    main()
