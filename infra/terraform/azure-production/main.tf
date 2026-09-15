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

resource "azurerm_container_group" "backup" {
  name                = "atmos-backup-prod"
  location            = "indonesiacentral"
  resource_group_name = "rg-atmos-prod"
  os_type             = "Linux"
  restart_policy      = "Never"
  ip_address_type     = "None"

  container {
    name     = "backup"
    image    = "ghcr.io/lqh-coding-frenzy/atmos-database-backup@sha256:ef26b061c33b50bed10b9fe345e6ec40e7eabde7e611a385324cbed7587e977b"
    cpu      = 0.25
    memory   = 0.5
    commands = ["/bin/sh", "-c", "exec timeout 1800 /usr/local/bin/backup"]

    environment_variables = {
      R2_ACCOUNT_ID = "50f15456a2d4abf3186c504f406da3fe"
      R2_BUCKET     = "atmos-production-backups"
    }
    secure_environment_variables = {
      SUPABASE_BACKUP_DATABASE_URL = var.backup_database_url
      BACKUP_ENCRYPTION_KEY        = var.backup_encryption_key
      R2_ACCESS_KEY_ID             = var.r2_access_key_id
      R2_SECRET_ACCESS_KEY         = var.r2_secret_access_key
    }
  }
}
