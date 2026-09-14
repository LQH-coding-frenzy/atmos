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
  source          = "./modules/cloudflare-edge"
  zone_id         = var.zone_id
  api_record_name = "api"
  worker_hostname = var.worker_hostname
}

module "r2" {
  source      = "./modules/cloudflare-r2"
  account_id  = var.account_id
  bucket_name = "atmos-production-backups"
}

module "queues" {
  source                 = "./modules/cloudflare-queues"
  account_id             = var.account_id
  queue_name             = "atmos-notifications"
  dead_letter_queue_name = "atmos-notifications-dlq"
}
