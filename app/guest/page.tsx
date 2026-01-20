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
  const [showSuccess, setShowSuccess] = useState(false); // 控制成功彈窗

  // 處理選擇照片
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
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
        // 🎉 顯示成功動畫，而不是醜醜的 alert
        setShowSuccess(true);
        setTimeout(() => {
            router.push('/'); // 3秒後跳轉回首頁
        }, 3000);
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
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* 背景裝飾光暈 */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 max-w-md w-full rounded-3xl shadow-2xl p-8 z-10">
        
        {/* Header 區域 */}
        <div className="text-center mb-10">
          <div className="inline-block p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/30 mb-4">
             <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Event Guest <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Pass</span>
          </h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            建立您的 AI 臉部檔案，<br/>活動中系統將自動為您尋找照片。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 姓名輸入 */}
          <div className="group">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">您的名字</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-900/50 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
                placeholder="例如：王小明"
                required
              />
            </div>
          </div>

          {/* 電話輸入 */}
          <div className="group">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">WhatsApp 電話</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-slate-500 group-focus-within:text-green-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-900/50 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all shadow-inner"
                placeholder="例如：+886912345678"
                required
              />
            </div>
          </div>

          {/* 照片上傳區 */}
          <div>
            <label className="flex justify-between items-end mb-3 ml-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI 參考照片</span>
              <span className="text-[10px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">建議 3 張不同角度</span>
            </label>
            
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-600/50 group shadow-lg">
                  <img 
                    src={URL.createObjectURL(photo)} 
                    className="w-full h-full object-cover transition duration-500 group-hover:scale-110" 
                    alt="preview" 
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="bg-red-500/80 hover:bg-red-500 text-white rounded-full p-2 backdrop-blur-sm transition-transform hover:scale-110"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                </div>
              ))}
              
              {/* 加號按鈕 (美化版) */}
              <label className={`aspect-square rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/10 transition group ${photos.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-2 group-hover:bg-blue-500 transition-colors">
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <span className="text-[10px] text-slate-500 group-hover:text-blue-300 font-medium">Add Photo</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  capture="user" // 優先開啟自拍鏡頭
                  className="hidden" 
                  onChange={handlePhotoSelect}
                  disabled={photos.length >= 5}
                />
              </label>
            </div>
          </div>

          {/* 送出按鈕 */}
          <button
            type="submit"
            disabled={uploading}
            className={`w-full py-4 rounded-xl font-bold text-white shadow-xl shadow-blue-500/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 ${
              uploading 
                ? 'bg-slate-700 cursor-not-allowed opacity-70' 
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
            }`}
          >
            {uploading ? (
                <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>AI 正在分析...</span>
                </>
            ) : (
                <>
                    <span>✨ 完成登記</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </>
            )}
          </button>
        </form>
      </div>

      {/* 成功彈窗 (取代 alert) */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl text-center max-w-sm w-[90%] transform animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">登記成功！</h3>
                <p className="text-slate-400 text-sm mb-6">
                    AI 已記住您的特徵。<br/>
                    正在為您跳轉至活動首頁...
                </p>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 animate-[width_3s_ease-out_forwards]" style={{width: '0%'}}></div>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}