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
  name                = "cae-atmos-prod"
  location            = "indonesiacentral"
  resource_group_name = "rg-atmos-prod"
}
