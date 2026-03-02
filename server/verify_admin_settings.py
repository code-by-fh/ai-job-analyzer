import requests
import sys

# Constants
API_URL = "http://localhost:8000"
USERNAME = "admin"
PASSWORD = "admin"  # Default password created by entrypoint

def login():
    try:
        response = requests.post(f"{API_URL}/auth/login", data={"username": USERNAME, "password": PASSWORD})
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            print(f"Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def verify_settings(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. GET Default
    print("\n--- Testing GET Default Settings ---")
    res = requests.get(f"{API_URL}/admin/settings", headers=headers)
    print(f"GET Status: {res.status_code}")
    print(f"GET Payload: {res.json()}")
    
    if res.status_code != 200:
        print("FAIL: Could not get settings")
        return False

    default_model = res.json().get("openrouter_model")
    if default_model != "tngtech/deepseek-r1t2-chimera:free":
        print(f"WARNING: Default model is not expected default (could be already set). Got: {default_model}")
    else:
        print("SUCCESS: Default model matches.")

    # 2. POST Update
    print("\n--- Testing POST Update Settings ---")
    new_model = "test/model:v1"
    res = requests.post(f"{API_URL}/admin/settings", json={"openrouter_model": new_model}, headers=headers)
    print(f"POST Status: {res.status_code}")
    print(f"POST Payload: {res.json()}")

    if res.status_code != 200:
        print("FAIL: Could not update settings")
        return False
    
    if res.json().get("openrouter_model") != new_model:
         print("FAIL: Response did not return updated model")
         return False
    print("SUCCESS: POST update successful.")

    # 3. GET Updated
    print("\n--- Testing GET Updated Settings ---")
    res = requests.get(f"{API_URL}/admin/settings", headers=headers)
    print(f"GET Status: {res.status_code}")
    print(f"GET Payload: {res.json()}")
    
    if res.json().get("openrouter_model") != new_model:
        print("FAIL: GET did not return updated model")
        return False
    
    print("SUCCESS: Model persistence verified.")
    
    # Reset to default
    print("\n--- Resetting to Default ---")
    requests.post(f"{API_URL}/admin/settings", json={"openrouter_model": "tngtech/deepseek-r1t2-chimera:free"}, headers=headers)
    
    return True

if __name__ == "__main__":
    token = login()
    if token:
        success = verify_settings(token)
        if success:
            print("\n✅ VERIFICATION PASSED")
        else:
            print("\n❌ VERIFICATION FAILED")
            sys.exit(1)
    else:
        print("\n❌ VERIFICATION FAILED (Login)")
        sys.exit(1)
