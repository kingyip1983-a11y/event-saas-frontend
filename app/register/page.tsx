'use client';
// Update check: v2 (force update)
'use client';
// ...
import { useState, useEffect } from 'react';

// 👇 請確認這是您的後端網址
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";

export default function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('852');
  
  // 錯誤訊息狀態
  const [phoneError, setPhoneError] = useState('');
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState('');

  // -----------------------------------------------------------
  // 🟢 1. 核心邏輯：電話輸入監聽
  // -----------------------------------------------------------
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val); // 先更新畫面上的字

    // 檢查是否有「非數字」的字元 (例如 +, -, 空格, abc)
    // [^0-9] 代表「除了 0-9 以外的所有字元」
    const hasNonDigits = /[^0-9]/.test(val);

    if (hasNonDigits) {
      setPhoneError('⚠️ 格式錯誤：請只輸入數字 (不能有 + 號或空格)');
    } else if (val.length > 0 && val.length < 8) {
       // 選擇性：如果太短也給個黃色提示 (不一定要擋死)
       setPhoneError('⚠️ 號碼似乎太短，請確認');
    } else {
      setPhoneError(''); // 清除錯誤
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
    
    // 防呆檢查
    if (phoneError || !name || !phone || photos.length === 0) {
        alert("請修正紅字錯誤，並填寫完整資料");
        return;
    }
    
    setStatus('正在上傳...');
    const formData = new FormData();
    formData.append('name', name);
    // 發送前再次確保只傳數字
    const cleanNumber = phone.replace(/\D/g, ''); 
    formData.append('phone', countryCode + cleanNumber);

    photos.forEach((file) => {
        formData.append('photos', file);
    });

    try {
        const res = await fetch(`${BACKEND_URL}/register`, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            setStatus(''); // 失敗的話，清空狀態讓使用者重試
        } else {
            alert(`成功！系統記住了 ${data.count} 個角度！`);
            // 重置表單
            setName('');
            setPhone('');
            setPhoneError('');
            setPhotos([]);
            setPreviews([]);
            setStatus('');
        }
    } catch (err) {
        alert("連線錯誤");
        setStatus('');
    }
  };

  // -----------------------------------------------------------
  // 🟢 2. 計算按鈕是否該鎖住
  // -----------------------------------------------------------
  // 條件：正在上傳 OR 沒照片 OR 沒名字 OR 沒電話 OR 有電話錯誤
  const isButtonDisabled = status !== '' || photos.length === 0 || !name || !phone || !!phoneError;

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-2">📸 多角度登記</h1>
        <p className="text-gray-400 text-center mb-6 text-sm">
            請拍攝 3 張不同角度 (正臉、側臉)
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* 照片預覽區 */}
          <div className="flex gap-4 overflow-x-auto py-2 min-h-[100px]">
             {previews.map((src, idx) => (
                 <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 border-blue-500">
                     <img src={src} className="w-full h-full object-cover" />
                     <button type="button" onClick={() => removePhoto(idx)} className="absolute top-0 right-0 bg-red-600 text-white w-6 h-6 flex items-center justify-center rounded-bl-lg text-xs">✕</button>
                 </div>
             ))}
             {photos.length < 3 && (
                 <label className="flex-shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-500 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-400 transition text-gray-500 bg-gray-700/50">
                     <span className="text-2xl">+</span><span className="text-xs">加照片</span>
                     <input type="file" accept="image/*" capture="user" onChange={handlePhoto} className="hidden" />
                 </label>
             )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">您的姓名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" placeholder="King Yip" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">WhatsApp 電話</label>
            <div className="flex gap-2">
                <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 focus:outline-none focus:border-blue-500">
                    <option value="852">🇭🇰 +852</option>
                    <option value="86">🇨🇳 +86</option>
                    <option value="886">🇹🇼 +886</option>
                    <option value="1">🇺🇸 +1</option>
                </select>
                
                {/* 👇 輸入框樣式：如果有錯誤 (phoneError)，邊框變紅色 */}
                <input 
                    type="tel" 
                    value={phone} 
                    onChange={handlePhoneChange} 
                    className={`flex-1 bg-gray-700 border rounded-lg px-4 py-3 focus:outline-none transition ${
                        phoneError 
                        ? 'border-red-500 focus:border-red-500 text-red-200' 
                        : 'border-gray-600 focus:border-blue-500'
                    }`} 
                    placeholder="61234567" 
                />
            </div>

            {/* 👇 錯誤訊息顯示區 (確保字夠大夠紅) */}
            {phoneError ? (
                <div className="mt-2 p-2 bg-red-900/50 border border-red-500/50 rounded-lg flex items-center gap-2 animate-pulse">
                    <span className="text-xl">🚫</span>
                    <p className="text-red-200 text-sm font-bold">{phoneError}</p>
                </div>
            ) : (
                <p className="text-gray-500 text-xs mt-2">
                    💡 請輸入純數字，不用加國碼 (例: <span className="text-gray-300">63530145</span>)
                </p>
            )}
          </div>

          {/* 👇 按鈕：樣式邏輯分離，確保變灰 */}
          <button 
            type="submit" 
            disabled={isButtonDisabled} 
            className={`w-full py-4 rounded-xl text-lg font-bold transition duration-200 ${
                isButtonDisabled 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'  // 🔒 鎖定狀態
                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/50' // ✅ 啟用狀態
            }`}
          >
            {status || `✅ 完成登記 (${photos.length} 張)`}
          </button>

        </form>
      </div>
    </main>
  );
}