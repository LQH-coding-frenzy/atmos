# Terraform Base

This directory pins the approved provider releases for Atmos. Provider configurations and resources belong only in the isolated environment roots and modules added by their owning tasks.

No token, Terraform state, provider configuration, or application deployment is committed here. HCP Terraform workspaces own remote state and remote runs; provider API tokens must be HCP sensitive variables.
