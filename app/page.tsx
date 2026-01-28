'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

// 🔌 雙重變數偵測
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

  // 處理照片選擇
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setSearched(false);
      setPhotos([]);
    }
  };

  // 執行搜尋
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

  // 下載功能
  const downloadPhoto = async (photoId: number, url: string) => {
    // 1. 觸發數據追蹤
    try {
        fetch(`${BACKEND_URL}/analytics/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoId, type: 'DOWNLOAD' })
        });
    } catch (e) { console.error(e); }

    // 2. 開啟原圖
    window.open(url, '_blank');
  };

  // 重置搜尋
  const resetSearch = () => {
      setSelectedImage(null);
      setPreviewUrl(null);
      setSearched(false);
      setPhotos([]);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-10">
      
      {/* Header / Hero Area */}
      {!searched ? (
          <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                找回您的精彩瞬間
            </h1>
            <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                使用 AI 人臉辨識技術，一秒鐘找出所有屬於您的活動照片。
            </p>

            {/* 上傳區塊 */}
            <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-md mx-auto">
                <div className="mb-6 relative w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800 shadow-inner group">
                {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                        <span className="text-4xl mb-2">🤳</span>
                        <span className="text-sm">尚未選擇照片</span>
                    </div>
                )}
                <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition text-white font-bold">
                    更改
                </button>
                </div>

                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

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
                        {isSearching ? '搜尋中...' : '🔍 開始搜尋'}
                    </button>
                )}
                </div>
            </div>
          </div>
      ) : (
          // 搜尋結果 Header
          <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg">
              <h2 className="text-xl font-bold flex items-center gap-2">
                  🎉 找到 {photos.length} 張
              </h2>
              <button 
                  onClick={resetSearch}
                  className="px-4 py-2 bg-slate-800 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition"
              >
                  🔄 重新搜尋
              </button>
          </div>
      )}

      {/* 搜尋結果列表 */}
      {searched && (
        <div className="max-w-7xl mx-auto px-4 mt-6">
            {photos.length === 0 ? (
                <div className="text-center py-20 bg-slate-900 rounded-2xl border border-slate-800 border-dashed mx-4">
                    <p className="text-slate-400 mb-4">系統找不到與您相似的照片。</p>
                    <button onClick={resetSearch} className="text-blue-400 hover:underline">換一張自拍試試？</button>
                </div>
            ) : (
                /* 🛠️ Layout 修正：
                   1. Grid 佈局：手機 2 欄，平板 3 欄，電腦 4 欄
                   2. Hybrid UI：手機按鈕在下方，電腦按鈕 Hover 顯示
                */
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                    {photos.map((photo) => (
                        <div 
                            key={photo.id} 
                            className="relative group bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800"
                        >
                            {/* 照片區域 - 強制統一 3:4 比例，解決不對稱 */}
                            <div className="relative w-full aspect-[3/4] bg-slate-800">
                                <img 
                                    src={photo.url} 
                                    className="w-full h-full object-cover transition duration-500 group-hover:scale-105" 
                                    loading="lazy" 
                                    alt="Event Photo"
                                />
                                
                                {/* 💻 電腦版專用：懸停遮罩 (Hover Overlay) */}
                                <div className="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex-col items-center justify-center gap-3 p-4">
                                     <button 
                                        onClick={() => downloadPhoto(photo.id, photo.originalUrl || photo.url)}
                                        className="px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-slate-200 transition transform hover:scale-105 shadow-xl"
                                    >
                                        ⬇️ 下載原圖
                                    </button>
                                    <button 
                                        className="px-6 py-2 bg-slate-700 text-white font-bold rounded-full hover:bg-slate-600 transition border border-slate-500 shadow-xl"
                                        onClick={() => {
                                            navigator.clipboard.writeText(photo.url);
                                            alert("連結已複製！");
                                        }}
                                    >
                                        🔗 分享
                                    </button>
                                </div>
                            </div>
                            
                            {/* 📱 手機版專用：下方按鈕 (Mobile Buttons) */}
                            <div className="md:hidden grid grid-cols-2 gap-px bg-slate-700 border-t border-slate-700">
                                <button 
                                    onClick={() => downloadPhoto(photo.id, photo.originalUrl || photo.url)}
                                    className="py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 active:bg-slate-600"
                                >
                                    ⬇️ 下載
                                </button>
                                <button 
                                    className="py-3 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-bold transition flex items-center justify-center gap-1 border-l border-slate-700 active:bg-slate-600"
                                    onClick={() => {
                                        if (navigator.share) {
                                            navigator.share({ title: '我的照片', url: photo.url }).catch(console.error);
                                        } else {
                                            navigator.clipboard.writeText(photo.url);
                                            alert("已複製");
                                        }
                                    }}
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
      {!searched && (
        <footer className="text-center py-8 text-slate-600 text-sm">
            <Link href="/register" className="hover:text-slate-400 transition mx-2">補登記資料</Link> | 
            <Link href="/photographer" className="hover:text-slate-400 transition mx-2">攝影師登入</Link>
        </footer>
      )}
    </main>
  );
}