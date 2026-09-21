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
