variable "operator_ip" {
  description = "Your current public IP, as a /32 CIDR, e.g. \"49.204.1.2/32\". Find it with curl https://checkip.amazonaws.com. The only address allowed to SSH into any host."
  type        = string
}

variable "key_name" {
  description = "Name of an EC2 key pair that already exists in ap-south-1. Create it once with: aws ec2 create-key-pair --key-name arka-phase3 --region ap-south-1 --query KeyMaterial --output text > arka-phase3.pem"
  type        = string
  default     = "arka-phase3"
}

variable "control_vpc_cidr" {
  description = "Control plane VPC CIDR."
  type        = string
  default     = "10.10.0.0/16"
}

variable "control_instance_type" {
  description = "Control plane runs console, gateway, recovery and the control Postgres, so it gets more headroom than a Cell."
  type        = string
  default     = "t2.medium"
}

variable "ubuntu_ami_name_filter" {
  description = "AMI name filter for Ubuntu 24.04 LTS (Noble), amd64, HVM, EBS-backed."
  type        = string
  default     = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
}

# One variable per Cell rather than a single map, so that applying with only some of these tfvars
# files present never touches the Cells that were not included. cell-3 defaults to null on purpose:
# that is what "written tonight, not applied tonight" means in Terraform terms.

variable "cell_1" {
  description = "Cell 1's config. Null means Cell 1 is not created."
  type = object({
    vpc_cidr      = string
    instance_type = string
  })
  default = null
}

variable "cell_2" {
  description = "Cell 2's config. Null means Cell 2 is not created."
  type = object({
    vpc_cidr      = string
    instance_type = string
  })
  default = null
}

variable "cell_3" {
  description = "Cell 3's config. Stays null, and this stays unapplied, until the panel deployment window."
  type = object({
    vpc_cidr      = string
    instance_type = string
  })
  default = null
}
