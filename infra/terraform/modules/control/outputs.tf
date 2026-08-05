output "public_ip" {
  value = aws_eip.this.public_ip
}

output "private_ip" {
  value = aws_instance.this.private_ip
}

output "console_hostname" {
  value = "arka.${aws_eip.this.public_ip}.nip.io"
}

output "api_hostname" {
  value = "arka-api.${aws_eip.this.public_ip}.nip.io"
}

output "gateway_hostname" {
  value = "arka-gw.${aws_eip.this.public_ip}.nip.io"
}

output "vpc_id" {
  value = aws_vpc.this.id
}
