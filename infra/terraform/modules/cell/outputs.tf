output "cell_id" {
  value = var.cell_id
}

output "public_ip" {
  value = aws_eip.this.public_ip
}

output "private_ip" {
  value = aws_instance.this.private_ip
}

output "hostname" {
  value = "${var.cell_id}.${aws_eip.this.public_ip}.nip.io"
}

output "api_hostname" {
  value = "${var.cell_id}-api.${aws_eip.this.public_ip}.nip.io"
}

output "vpc_id" {
  value = aws_vpc.this.id
}
