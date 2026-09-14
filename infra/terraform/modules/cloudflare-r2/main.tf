terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.25.0"
    }
  }
}

resource "cloudflare_r2_bucket" "backup" {
  account_id = var.account_id
  name       = var.bucket_name
  location   = "APAC"
}
