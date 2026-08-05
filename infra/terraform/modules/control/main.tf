# The control plane: its own VPC, subnet, internet gateway, route table, security group, Elastic IP
# and EC2 host. No peering, no transit gateway, no shared resource with any Cell.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "arka-control"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 0)
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "arka-control-public"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "arka-control-igw"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = {
    Name = "arka-control-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "this" {
  name        = "arka-control-sg"
  description = "Control plane host: public 80/443 for the console and gateway, 22 for the operator only"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "arka-control-sg"
  }
}

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
    Name = "arka-control"
  }
}

# Its own resource, created ahead of anything that needs to reference its address, so every Cell
# module can read the control plane's public IP without a dependency cycle.
resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id

  tags = {
    Name = "arka-control-eip"
  }
}
