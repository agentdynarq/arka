variable "cell_id" {
  description = "Becomes CELL_ID in the container environment. Also used to name every AWS object for this Cell."
  type        = string
}

variable "vpc_cidr" {
  description = "Must not overlap another Cell's CIDR, though nothing routes between them anyway."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for this Cell's single host."
  type        = string
}

variable "ami_id" {
  description = "Ubuntu 24.04 AMI id, resolved once in root and passed to every module so all hosts match."
  type        = string
}

variable "control_plane_ip" {
  description = "The control plane's Elastic IP, /32. Only source allowed to reach 5432 and 6379."
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
