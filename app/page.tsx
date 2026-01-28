'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// 🔌 修正：同時支援兩種變數名稱，並保留 Production 作為最後防線
const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.NEXT_PUBLIC_API_URL || 
  "https://event-saas-backend-production.up.railway.app";

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setSearched(false); // 重置搜尋狀態
      setPhotos([]);
    }
  };

  const handleSearch = async () => {
    if (!selectedImage) return alert('請先選擇或拍攝照片');

    setIsSearching(true);
    setSearched(false);
    
    const formData = new FormData();
    formData.append('selfie', selectedImage);

    try {
        console.log(`🚀 正在搜尋: ${BACKEND_URL}/guest-search`);
        const res = await fetch(`${BACKEND_URL}/guest-search`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) throw new Error('搜尋失敗');

        const data = await res.json();
        setPhotos(data);
    } catch (error) {
        console.error(error);
        alert('連線錯誤，請稍後再試');
    } finally {
        setIsSearching(false);
        setSearched(true);
    }
  };

  const downloadPhoto = async (photoId: number, url: string) => {
    // 觸發數據追蹤
    try {
        fetch(`${BACKEND_URL}/analytics/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoId, type: 'DOWNLOAD' })
        });
    } catch (e) { console.error(e); }

    // 開啟下載
    window.open(url, '_blank');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            找回您的精彩瞬間
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            使用 AI 人臉辨識技術，一秒鐘找出所有屬於您的活動照片。
          </p>

          {/* 上傳/自拍區塊 */}
          <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-md mx-auto transform transition hover:scale-[1.02]">
            
            {/* 預覽區 */}
            <div className="mb-6 relative w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800 shadow-inner group">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                  <span className="text-4xl mb-2">🤳</span>
                  <span className="text-sm">尚未選擇照片</span>
                </div>
              )}
              {/* 更改照片遮罩 */}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-white font-bold"
              >
                更改照片
              </button>
            </div>

            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*" 
              // capture="user" // 如果想要手機直接跳自拍鏡頭，可以解開這行
              onChange={handleFileChange} 
              className="hidden" 
            />

            <div className="space-y-3">
              {!selectedImage ? (
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-lg shadow-blue-900/20 transition"
                 >
                    📸 拍攝 / 上傳自拍
                 </button>
              ) : (
                 <button 
                    onClick={handleSearch} 
                    disabled={isSearching}
                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition flex items-center justify-center gap-2 ${isSearching ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20'}`}
                 >
                    {isSearching ? (
                        <>
                           <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                           搜尋中...
                        </>
                    ) : '🔍 開始搜尋'}
                 </button>
              )}
            </div>
            
            <div className="mt-4 text-xs text-slate-500">
               系統目前連線至: <span className="font-mono text-slate-400">{BACKEND_URL.includes('demo') ? 'Demo 環境 🧪' : '正式環境 🚀'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 搜尋結果 */}
      {searched && (
        <div className="max-w-7xl mx-auto px-6 pb-20">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                {photos.length > 0 ? `🎉 找到 ${photos.length} 張照片` : '🤔 找不到照片'}
            </h2>
            
            {photos.length === 0 ? (
                <div className="text-center py-20 bg-slate-900 rounded-2xl border border-slate-800 border-dashed">
                    <p className="text-slate-400 mb-4">系統找不到與您相似的照片。</p>
                    <button onClick={() => fileInputRef.current?.click()} className="text-blue-400 hover:underline">試試看換一張自拍？</button>
                </div>
            ) : (
                <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                    {photos.map((photo) => (
                        <div key={photo.id} className="break-inside-avoid relative group bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 mb-4">
                            <img src={photo.url} className="w-full h-auto block" loading="lazy" />
                            
                            {/* 遮罩與按鈕 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-4">
                                <button 
                                    onClick={() => downloadPhoto(photo.id, photo.originalUrl || photo.url)}
                                    className="w-full py-2 bg-white text-black font-bold rounded-lg mb-2 hover:bg-slate-200 transition text-sm"
                                >
                                    ⬇️ 下載原圖
                                </button>
                                <button 
                                    // 這裡可以做分享功能
                                    className="w-full py-2 bg-slate-700/50 backdrop-blur text-white font-bold rounded-lg hover:bg-slate-600 transition text-sm border border-slate-600"
                                >
                                    🔗 分享
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
      
      {/* Footer */}
      <footer className="text-center py-8 text-slate-600 text-sm">
        <Link href="/register" className="hover:text-slate-400 transition mx-2">補登記資料</Link> | 
        <Link href="/photographer" className="hover:text-slate-400 transition mx-2">攝影師登入</Link>
      </footer>
    </main>
  );
}