output "control" {
  description = "Control plane addresses. Hasitha's control host env template points here."
  value = {
    public_ip        = module.control.public_ip
    private_ip       = module.control.private_ip
    console_hostname = module.control.console_hostname
    api_hostname     = module.control.api_hostname
    gateway_hostname = module.control.gateway_hostname
  }
}

output "cells" {
  description = "Per-Cell addresses. Hasitha's control host env template needs every Cell's private_ip."
  value = {
    for k, m in module.cell : k => {
      public_ip    = m.public_ip
      private_ip   = m.private_ip
      hostname     = m.hostname
      api_hostname = m.api_hostname
    }
  }
}
