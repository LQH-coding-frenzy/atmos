terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.25.0"
    }
  }
}

resource "cloudflare_dns_record" "api" {
  zone_id = var.zone_id
  name    = var.api_record_name
  type    = "CNAME"
  content = var.worker_hostname
  proxied = true
  ttl     = 1
  comment = "Atmos production API Worker"
}
