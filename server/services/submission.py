"""Placeholder for future online-submission adapters.

Automated online submission to job boards is explicitly OUT OF SCOPE
(see context/project-overview.md). This interface exists only so a future
implementation can plug in without touching the package-generation flow.
"""


class SubmissionAdapter:
    def submit(self, job, profile, documents) -> dict:
        raise NotImplementedError("Online submission is out of scope.")
