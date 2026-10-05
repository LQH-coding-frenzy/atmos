terraform {
  required_version = "= 1.16.2"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "= 1.11.0"
    }
  }

  cloud {
    organization = "atmos_uit"

    workspaces {
      name = "atmos-data-production"
    }
  }
}

variable "project_ref" {
  description = "Existing production Supabase project reference supplied by the HCP workspace."
  type        = string
}

provider "supabase" {}

resource "supabase_settings" "production" {
  project_ref = var.project_ref

  auth = jsonencode({
    site_url       = "https://rainify.dpdns.org"
    uri_allow_list = "https://rainify.dpdns.org"
  })

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = supabase_settings.production
  id = var.project_ref
}
