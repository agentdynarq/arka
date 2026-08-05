# One Cell: its own VPC, subnet, internet gateway, route table, security group, Elastic IP and EC2
# host. No peering, no transit gateway, no shared resource of any kind with another Cell.
#
# No conditional on cell_id anywhere in this file. If a Cell ever needs a special case here, that is
# an architecture violation in the services, not something to patch in Terraform.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "arka-${var.cell_id}"
    Cell = var.cell_id
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 0)
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "arka-${var.cell_id}-public"
    Cell = var.cell_id
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "arka-${var.cell_id}-igw"
    Cell = var.cell_id
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "arka-${var.cell_id}-public-rt"
    Cell = var.cell_id
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "this" {
  name        = "arka-${var.cell_id}-sg"
  description = "Cell host: public 80/443 for customers, 22 for the operator, 5432/6379 for the control plane only"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "arka-${var.cell_id}-sg"
    Cell = var.cell_id
  }
}

# Customers browse their own Cell directly, and the Gateway reaches this Cell's identity API on the
# same port via a different hostname. The workload token, not the security group, is what stops a
# stranger from doing anything but getting a 401.
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.this.id
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.this.id
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.this.id
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  cidr_ipv4         = var.operator_ip
}

# Postgres and Redis are bound to this Cell's internal Docker network, never published to the host,
# so there is no real listener behind either rule. Declared anyway, narrowed to the control plane's
# single address, as defense in depth and to match the interface this module was specified against.
resource "aws_vpc_security_group_ingress_rule" "postgres_from_control" {
  security_group_id = aws_security_group.this.id
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
  cidr_ipv4         = var.control_plane_ip
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_control" {
  security_group_id = aws_security_group.this.id
  from_port         = 6379
  to_port           = 6379
  ip_protocol       = "tcp"
  cidr_ipv4         = var.control_plane_ip
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.this.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.this.id]
  key_name                    = var.key_name
  associate_public_ip_address = true
  user_data                   = file("${path.module}/cloud-init.sh")

  tags = {
    Name = "arka-${var.cell_id}"
    Cell = var.cell_id
  }
}

# Its own resource, ahead of nothing in this module, so the root can read its address without
# creating a dependency cycle back into another Cell or the control plane.
resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id

  tags = {
    Name = "arka-${var.cell_id}-eip"
    Cell = var.cell_id
  }
}
