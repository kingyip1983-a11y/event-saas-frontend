'use client';
import { useState, useEffect } from 'react';

// 👇 請確認 IP
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";

interface Photo {
  id: number;
  url: string;
}

export default function GuestGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'all' | 'search'>('all'); // all=逛相簿, search=搜尋結果

  // 1. 一進來先載入所有最新照片 (讓客人有東西看)
  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = () => {
    setMode('all');
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPhotos(data.reverse()); // 最新的在上面
      })
      .catch(console.error);
  };

  // 2. 處理客人的自拍搜尋
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('selfie', file);

    try {
      const res = await fetch(`${BACKEND_URL}/guest-search`, {
        method: 'POST',
        body: formData
      });
      const results = await res.json();
      
      if (results.error) {
        alert(results.error);
      } else {
        setPhotos(results);
        setMode('search'); // 切換到搜尋結果模式
      }
    } catch (err) {
      alert('連線失敗，請稍後再試');
    } finally {
      setLoading(false);
      e.target.value = ''; // 清空 input 讓下次還能觸發
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* 頂部導航 */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md p-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Event Gallery
        </h1>
        {mode === 'search' && (
          <button 
            onClick={fetchPhotos}
            className="text-sm text-gray-400 hover:text-white"
          >
            ✕ 清除搜尋
          </button>
        )}
      </div>

      {/* 照片瀑布流 */}
      <div className="p-2 grid grid-cols-2 md:grid-cols-3 gap-2">
        {loading ? (
          <div className="col-span-full py-20 text-center text-gray-500 animate-pulse">
            🤖 AI 正在大海撈針尋找您...
          </div>
        ) : photos.length > 0 ? (
          photos.map(photo => (
            <div key={photo.id} className="relative aspect-[2/3] bg-gray-900 rounded-lg overflow-hidden">
              <img 
                src={photo.url} 
                className="w-full h-full object-cover" 
                loading="lazy"
                alt="Event Photo"
              />
              {/* 下載按鈕 */}
              <a 
                href={photo.url}
                target="_blank"
                download
                className="absolute bottom-2 right-2 bg-white/20 hover:bg-white/40 backdrop-blur rounded-full p-2 transition"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </a>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center text-gray-500">
            {mode === 'search' ? '😢 找不到相似的照片，換個角度試試？' : '尚無照片'}
          </div>
        )}
      </div>

      {/* 底部懸浮按鈕 (Magic Button) */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50">
        <label className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 cursor-pointer transform transition hover:scale-105 active:scale-95 border-2 border-blue-400/50">
          {/* 這個 Input 支援直接呼叫手機相機 */}
          <input 
            type="file" 
            accept="image/*" 
            capture="user" // 加上這行會強制開前鏡頭，不加則可以選相簿
            onChange={handleSearch} 
            className="hidden" 
          />
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="font-bold text-lg">找我的照片</span>
        </label>
      </div>
    </div>
  );
}