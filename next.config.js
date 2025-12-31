/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow network access from any IP in 192.168.86.* subnet
  allowedDevOrigins: ['192.168.86.32', '*.192.168.86.32'],
}

module.exports = nextConfig
