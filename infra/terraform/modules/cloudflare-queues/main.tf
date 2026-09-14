terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.25.0"
    }
  }
}

resource "cloudflare_queue" "notifications" {
  account_id = var.account_id
  queue_name = var.queue_name
}

resource "cloudflare_queue" "notifications_dlq" {
  account_id = var.account_id
  queue_name = var.dead_letter_queue_name
}
