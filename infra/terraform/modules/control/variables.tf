variable "vpc_cidr" {
  description = "Control plane VPC CIDR."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the control plane host."
  type        = string
}

variable "ami_id" {
  description = "Ubuntu 24.04 AMI id, resolved once in root and passed to every module so all hosts match."
  type        = string
}

variable "operator_ip" {
  description = "The operator's current public IP, /32. Only source allowed to reach 22."
  type        = string
}

variable "key_name" {
  description = "Name of an EC2 key pair that already exists in this account and region."
  type        = string
}
