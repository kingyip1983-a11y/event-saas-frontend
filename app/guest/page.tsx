'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 👇 請確認這是你的 Railway 後端網址
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";

export default function GuestRegister() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // 處理選擇照片 (支援多選)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // 把新選的照片加入現有的陣列
      setPhotos(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // 移除某張照片
  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // 送出登記資料
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || photos.length === 0) {
      alert('請填寫完整資料並至少上傳一張照片');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phone);
    
    // 把每一張照片都塞進 FormData
    photos.forEach(photo => {
      formData.append('photos', photo);
    });

    try {
      const res = await fetch(`${BACKEND_URL}/register`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        alert(`🎉 登記成功！AI 已記住您的臉，共 ${data.count} 個角度。`);
        // 成功後跳轉回首頁 (或清空表單)
        router.push('/'); 
      } else {
        alert(`登記失敗: ${data.error || '未知錯誤'}`);
      }
    } catch (error) {
      console.error(error);
      alert('連線失敗，請檢查網路');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-800">
            👋 歡迎參加！
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            請輸入資料並自拍幾張照片，<br/>
            AI 將會在活動中自動幫您找照片！
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 姓名輸入 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">您的名字</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="例如：王小明"
              required
            />
          </div>

          {/* 電話輸入 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">WhatsApp 電話</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="例如：+886912345678"
              required
            />
          </div>

          {/* 照片上傳區 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              📸 拍攝參考照 (建議 3 張不同角度)
            </label>
            
            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                  <img 
                    src={URL.createObjectURL(photo)} 
                    className="w-full h-full object-cover" 
                    alt="preview" 
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md w-5 h-5 flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
              
              {/* 加號按鈕 */}
              <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition text-slate-400 hover:text-blue-500">
                <span className="text-2xl font-bold">+</span>
                <span className="text-xs">加照片</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  capture="user" // 在手機上會優先開前鏡頭
                  className="hidden" 
                  onChange={handlePhotoSelect} 
                />
              </label>
            </div>
            <p className="text-xs text-slate-400 text-center">
              已選擇 {photos.length} 張照片
            </p>
          </div>

          {/* 送出按鈕 */}
          <button
            type="submit"
            disabled={uploading}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 ${
              uploading 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:to-indigo-700 shadow-blue-200'
            }`}
          >
            {uploading ? '🔄 資料建立中...' : '✨ 完成登記'}
          </button>
        </form>
      </div>
    </main>
  );
}