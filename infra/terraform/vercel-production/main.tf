terraform {
  required_version = "= 1.16.2"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "= 5.16.0"
    }
  }

  cloud {
    organization = "atmos_uit"

    workspaces {
      name = "atmos-vercel"
    }
  }
}

variable "team_id" {
  description = "Existing Vercel team ID supplied by the HCP workspace."
  type        = string
}

variable "project_id" {
  description = "Existing Atmos Vercel project ID supplied by the HCP workspace."
  type        = string
}

variable "production_domain" {
  description = "Existing production domain attached to the Atmos Vercel project."
  type        = string
  default     = "rainify.dpdns.org"
}

provider "vercel" {
  team = var.team_id
}

resource "vercel_project_domain" "production" {
  project_id = var.project_id
  team_id    = var.team_id
  domain     = var.production_domain

  lifecycle {
    prevent_destroy = true
  }
}

import {
  to = vercel_project_domain.production
  id = "${var.project_id}/${var.production_domain}"
}
