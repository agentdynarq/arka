# Written tonight, deliberately not applied. This is the panel-day move: in the deployment window,
# run
#
#   terraform apply -var-file=cells/cell-1.tfvars -var-file=cells/cell-2.tfvars \
#     -var-file=cells/cell-3.tfvars -var operator_ip="<your current IP>/32"
#
# Always pass every currently-live Cell's tfvars together. Applying with only this file would make
# Terraform see cell_1 and cell_2 revert to null and destroy them, which is not the demonstration.

cell_3 = {
  vpc_cidr      = "10.3.0.0/16"
  instance_type = "t3.small"
}
