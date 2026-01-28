/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 1. 加入這段 env 設定，強制把系統變數塞給前端
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  },
  
  // 👇 2. 如果您原本有其他設定 (如 images)，請保留
  images: {
    domains: ['event-saas-backend-production.up.railway.app', 'event-saas-backend-demo.up.railway.app'], 
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.up.railway.app',
      },
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      }
    ],
  },
};

module.exports = nextConfig;