variable "subscription_id" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "client_id" {
  type = string
}

variable "tfc_azure_dynamic_credentials" {
  description = "Azure dynamic credential paths supplied by HCP Terraform"
  type = object({
    default = object({
      client_id_file_path  = string
      oidc_token_file_path = string
    })
    aliases = map(object({
      client_id_file_path  = string
      oidc_token_file_path = string
    }))
  })
}

variable "backup_database_url" {
  type      = string
  sensitive = true
}

variable "backup_encryption_key" {
  type      = string
  sensitive = true
}

variable "r2_access_key_id" {
  type      = string
  sensitive = true
}

variable "r2_secret_access_key" {
  type      = string
  sensitive = true
}

variable "run_restore_drill" {
  type    = bool
  default = false
}

variable "restore_database_url" {
  type      = string
  sensitive = true
  default   = null
}
