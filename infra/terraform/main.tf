# Instantiates the control plane once, and modules/cell once per non-null cell_N variable. Adding a
# Cell is: write its tfvars, pass it at apply. Nothing in this file changes.

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = [var.ubuntu_ami_name_filter]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

module "control" {
  source = "./modules/control"

  vpc_cidr      = var.control_vpc_cidr
  instance_type = var.control_instance_type
  ami_id        = data.aws_ami.ubuntu.id
  operator_ip   = var.operator_ip
  key_name      = var.key_name
}

locals {
  # Only Cells whose variable is non-null get created. cell-3 stays out of this map until its
  # tfvars is deliberately passed at apply time tomorrow morning.
  cells = {
    for k, v in {
      cell-1 = var.cell_1
      cell-2 = var.cell_2
      cell-3 = var.cell_3
    } : k => v if v != null
  }
}

module "cell" {
  source   = "./modules/cell"
  for_each = local.cells

  cell_id          = each.key
  vpc_cidr         = each.value.vpc_cidr
  instance_type    = each.value.instance_type
  ami_id           = data.aws_ami.ubuntu.id
  control_plane_ip = "${module.control.public_ip}/32"
  operator_ip      = var.operator_ip
  key_name         = var.key_name
}
