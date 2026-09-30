terraform {
  cloud {
    organization = "atmos_uit"

    workspaces {
      name = "atmos-edge-production"
    }
  }
}

provider "cloudflare" {}

module "edge" {
  source     = "./modules/cloudflare-edge"
  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = "api.rainify.dpdns.org"
  service    = "atmos-gateway"
}

module "r2" {
  source      = "./modules/cloudflare-r2"
  account_id  = var.account_id
  bucket_name = "atmos-production-backups"
}

resource "cloudflare_ruleset" "worker_version_affinity" {
  zone_id     = var.zone_id
  name        = "Atmos API version affinity"
  description = "Map validated browser-session keys to Cloudflare Worker versions."
  kind        = "zone"
  phase       = "http_request_late_transform"

  rules = [{
    ref         = "atmos_api_version_affinity"
    description = "Set Worker version affinity for the production API hostname."
    enabled     = true
    expression  = "(http.host eq \"api.rainify.dpdns.org\" and any(http.request.headers[\"x-atmos-version-key\"][*] matches \"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$\"))"
    action      = "rewrite"
    action_parameters = {
      headers = {
        "Cloudflare-Workers-Version-Key" = {
          operation  = "set"
          expression = "http.request.headers[\"x-atmos-version-key\"][0]"
        }
      }
    }
  }]
}
