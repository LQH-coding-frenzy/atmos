terraform {
  required_version = "= 1.16.2"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.5.0"
    }
  }

  cloud {
    organization = "atmos_uit"

    workspaces {
      name = "atmos-azure-production"
    }
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
  client_id       = var.client_id
  use_oidc        = true
  use_cli         = false
  features {}
}

resource "azurerm_container_app_environment" "production" {
  name                       = "cae-atmos-prod"
  location                   = "indonesiacentral"
  resource_group_name        = "rg-atmos-prod"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.production.id
  logs_destination           = "log-analytics"

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
    minimum_count         = 0
    maximum_count         = 0
  }
}

resource "azurerm_log_analytics_workspace" "production" {
  name                = "law-atmos-prod"
  location            = "indonesiacentral"
  resource_group_name = "rg-atmos-prod"
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_job" "backup" {
  name                         = "atmos-backup-prod"
  location                     = "indonesiacentral"
  resource_group_name          = "rg-atmos-prod"
  container_app_environment_id = azurerm_container_app_environment.production.id
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 1
  workload_profile_name        = "Consumption"

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  secret {
    name  = "backup-database-url"
    value = var.backup_database_url
  }

  secret {
    name  = "backup-encryption-key"
    value = var.backup_encryption_key
  }

  secret {
    name  = "r2-access-key-id"
    value = var.r2_access_key_id
  }

  secret {
    name  = "r2-secret-access-key"
    value = var.r2_secret_access_key
  }

  template {
    container {
      name   = "backup"
      image  = "ghcr.io/lqh-coding-frenzy/atmos-database-backup@sha256:08c34cb6ca0dcb3aee44e3a0150c06c4234125975450c81f5ef80480bab1fd45"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "SUPABASE_BACKUP_DATABASE_URL"
        secret_name = "backup-database-url"
      }
      env {
        name        = "BACKUP_ENCRYPTION_KEY"
        secret_name = "backup-encryption-key"
      }
      env {
        name        = "R2_ACCESS_KEY_ID"
        secret_name = "r2-access-key-id"
      }
      env {
        name        = "R2_SECRET_ACCESS_KEY"
        secret_name = "r2-secret-access-key"
      }
      env {
        name  = "R2_ACCOUNT_ID"
        value = "50f15456a2d4abf3186c504f406da3fe"
      }
      env {
        name  = "R2_BUCKET"
        value = "atmos-production-backups"
      }
    }
  }
}
