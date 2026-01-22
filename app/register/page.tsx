'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // 引入路由跳轉

const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";

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
        const res = await fetch(`${BACKEND_URL}/register`, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            setStatus('');
        } else {
            alert(`🎉 登記成功！`);
            // 👇 登記成功後，自動跳轉回首頁 (讓客人可以開始找照片)
            router.push('/'); 
        }
    } catch (err) { alert("連線錯誤"); setStatus(''); }
  };

  const isButtonDisabled = status !== '' || photos.length === 0 || !name || !phone || !!phoneError;

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
        <h1 className="text-3xl font-bold text-center mb-2">📸 多角度登記</h1>
        <p className="text-gray-400 text-center mb-6 text-sm">請拍攝 3 張不同角度</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex gap-4 overflow-x-auto py-2 min-h-[100px]">
             {previews.map((src, idx) => (
                 <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 border-blue-500">
                     <img src={src} className="w-full h-full object-cover" />
                     <button type="button" onClick={() => removePhoto(idx)} className="absolute top-0 right-0 bg-red-600 text-white w-6 h-6 flex items-center justify-center text-xs">✕</button>
                 </div>
             ))}
             {photos.length < 3 && (
                 <label className="flex-shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-500 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 text-gray-500 bg-gray-700/50">
                     <span className="text-2xl">+</span><span className="text-xs">加照片</span>
                     <input type="file" accept="image/*" capture="user" onChange={handlePhoto} className="hidden" />
                 </label>
             )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">您的姓名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 outline-none" placeholder="King Yip" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">WhatsApp 電話</label>
            <div className="flex gap-2">
                <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 outline-none">
                    <option value="852">🇭🇰 +852</option>
                    <option value="86">🇨🇳 +86</option>
                    <option value="886">🇹🇼 +886</option>
                    <option value="1">🇺🇸 +1</option>
                </select>
                <input type="tel" value={phone} onChange={handlePhoneChange} className={`flex-1 bg-gray-700 border rounded-lg px-4 py-3 outline-none ${phoneError ? 'border-red-500' : 'border-gray-600'}`} placeholder="61234567" />
            </div>
            {phoneError && <p className="text-red-400 text-xs mt-2">{phoneError}</p>}
          </div>

          <button type="submit" disabled={isButtonDisabled} className={`w-full py-4 rounded-xl text-lg font-bold transition ${isButtonDisabled ? 'bg-gray-600 opacity-50' : 'bg-green-600 hover:bg-green-500'}`}>
            {status || `✅ 完成登記 (${photos.length} 張)`}
          </button>
        </form>
      </div>
    </main>
  );
}