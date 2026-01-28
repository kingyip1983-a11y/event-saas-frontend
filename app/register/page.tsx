'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 🔌 修正：同時支援兩種變數名稱，並保留 Production 作為最後防線
// 這樣能確保 Demo 環境抓到 Demo 後端，Production 環境抓到 Production 後端
const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.NEXT_PUBLIC_API_URL || 
  "https://event-saas-backend-production.up.railway.app";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('852');
  const [phoneError, setPhoneError] = useState('');
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);
    const hasNonDigits = /[^0-9]/.test(val);
    if (hasNonDigits) {
      setPhoneError('⚠️ 格式錯誤：請只輸入數字 (不能有 + 號或空格)');
    } else {
      setPhoneError(''); 
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setPhotos(prev => [...prev, file]);
      setPreviews(prev => [...prev, URL.createObjectURL(file)]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError || !name || !phone || photos.length === 0) return alert("請修正錯誤");
    
    setStatus('正在上傳...');
    const formData = new FormData();
    formData.append('name', name);
    const cleanNumber = phone.replace(/\D/g, ''); 
    formData.append('phone', countryCode + cleanNumber);
    photos.forEach((file) => formData.append('photos', file));

    try {
        console.log(`🚀 正在傳送資料到: ${BACKEND_URL}/register`); // Debug 用

        const res = await fetch(`${BACKEND_URL}/register`, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            setStatus('');
        } else {
            alert(`🎉 登記成功！`);
            // 👇 登記成功後跳轉
            router.push('/'); 
        }
    } catch (err) { 
        console.error("連線錯誤:", err);
        alert("連線錯誤，請檢查網路或後端狀態"); 
        setStatus(''); 
    }
  };

  const isButtonDisabled = status !== '' || photos.length === 0 || !name || !phone || !!phoneError;

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        <h1 className="text-3xl font-extrabold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            📸 多角度登記
        </h1>
        <p className="text-slate-400 text-center mb-6 text-sm">請拍攝 1~3 張不同角度的照片</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 🖼️ 照片預覽區 (已優化捲動與間距) */}
          <div className="flex gap-4 overflow-x-auto py-2 min-h-[110px] px-1 scrollbar-hide">
             {previews.map((src, idx) => (
                 <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 border-blue-500 shadow-lg group">
                     <img src={src} className="w-full h-full object-cover" alt="preview" />
                     {/* 刪除按鈕 */}
                     <button 
                        type="button" 
                        onClick={() => removePhoto(idx)} 
                        className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs backdrop-blur-sm transition"
                     >
                        ✕
                     </button>
                 </div>
             ))}
             
             {/* 加照片按鈕 */}
             {photos.length < 5 && (
                 <label className="flex-shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-slate-600 hover:border-blue-400 hover:bg-slate-700/50 flex flex-col items-center justify-center cursor-pointer text-slate-500 hover:text-blue-400 transition bg-slate-800/50">
                     <span className="text-3xl mb-1">+</span>
                     <span className="text-[10px] font-bold">加照片</span>
                     <input type="file" accept="image/*" capture="user" onChange={handlePhoto} className="hidden" />
                 </label>
             )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">您的姓名</label>
            <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="w-full bg-slate-700 border border-slate-600 focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition placeholder-slate-500" 
                placeholder="例如: King Yip" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">WhatsApp 電話</label>
            <div className="flex gap-2">
                <select 
                    value={countryCode} 
                    onChange={e => setCountryCode(e.target.value)} 
                    className="bg-slate-700 border border-slate-600 focus:border-blue-500 rounded-xl px-3 py-3 outline-none"
                >
                    <option value="852">🇭🇰 +852</option>
                    <option value="86">🇨🇳 +86</option>
                    <option value="886">🇹🇼 +886</option>
                    <option value="1">🇺🇸 +1</option>
                </select>
                <input 
                    type="tel" 
                    value={phone} 
                    onChange={handlePhoneChange} 
                    className={`flex-1 bg-slate-700 border rounded-xl px-4 py-3 outline-none transition placeholder-slate-500 ${phoneError ? 'border-red-500' : 'border-slate-600 focus:border-blue-500'}`} 
                    placeholder="61234567" 
                />
            </div>
            {phoneError && <p className="text-red-400 text-xs mt-2 ml-1">{phoneError}</p>}
          </div>

          <button 
            type="submit" 
            disabled={isButtonDisabled} 
            className={`w-full py-4 rounded-xl text-lg font-bold shadow-lg transition transform active:scale-95 ${isButtonDisabled ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white'}`}
          >
            {status ? (
                <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                    處理中...
                </span>
            ) : `✅ 完成登記 (${photos.length} 張)`}
          </button>
        </form>
      </div>
    </main>
  );
}