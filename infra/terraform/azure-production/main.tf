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
    image    = "ghcr.io/lqh-coding-frenzy/atmos-database-backup@sha256:21705d456b370ef0992d38f5ffb13aa67cb0bf0a939f51ea934a14a925b94df0"
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

resource "azurerm_container_group" "restore_drill" {
  count               = var.run_restore_drill ? 1 : 0
  name                = "atmos-restore-drill-prod"
  location            = "indonesiacentral"
  resource_group_name = "rg-atmos-prod"
  os_type             = "Linux"
  restart_policy      = "Never"
  ip_address_type     = "None"

  container {
    name   = "postgres"
    image  = "postgres:17.7-alpine3.22@sha256:6b591f995765a189e69276dd55e0b362342d65d10d0359bb1fab67bc3391f20f"
    cpu    = 0.25
    memory = 0.5

    environment_variables = {
      POSTGRES_HOST_AUTH_METHOD = "trust"
    }
  }

  container {
    name     = "restore"
    image    = "ghcr.io/lqh-coding-frenzy/atmos-database-backup@sha256:d9b8a760a3ae5fe8fc097db60662e20ac85af35cabd90fff3e11cf04e38c6c18"
    cpu      = 0.25
    memory   = 0.5
    commands = ["/bin/sh", "-c", "exec /usr/local/bin/restore"]

    environment_variables = {
      R2_ACCOUNT_ID  = "50f15456a2d4abf3186c504f406da3fe"
      R2_BUCKET      = "atmos-production-backups"
      RESTORE_OBJECT = "backups/2026/09/15/atmos-backup-20260915T162922Z.tar.gz.enc"
    }
    secure_environment_variables = {
      BACKUP_ENCRYPTION_KEY = var.backup_encryption_key
      R2_ACCESS_KEY_ID      = var.r2_access_key_id
      R2_SECRET_ACCESS_KEY  = var.r2_secret_access_key
    }
  }
}
