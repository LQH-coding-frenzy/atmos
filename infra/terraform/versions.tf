terraform {
  required_version = "= 1.16.2"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "= 3.9.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.25.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "= 1.11.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "= 5.16.0"
    }
  }
}
