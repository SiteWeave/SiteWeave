import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

const ICONS = {
    Pdf: <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-8 h-8 text-red-500" />,
    Folder: <Icon path="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="w-8 h-8 text-blue-500" />,
    Image: <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="w-8 h-8 text-green-500" />,
    File: <Icon path="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5V6a2.25 2.25 0 012.25-2.25h4.5a2.25 2.25 0 012.25 2.25v4.5zm-9-9V1.5c0-.621.504-1.125 1.125-1.125h1.5A1.125 1.125 0 0113.5 1.5v9" className="w-8 h-8 text-gray-500"/>
};

function FileItem({ file }) {
    const { t, i18n } = useTranslation();
    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(i18n.language, { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const getIcon = (type) => {
        if (type === 'pdf') return ICONS.Pdf;
        if (type.startsWith('image')) return ICONS.Image; // Handle image/jpeg, image/png, etc.
        if (type === 'folder') return ICONS.Folder;
        return ICONS.File; // Default icon for other file types
    };

    const handleClick = () => {
        if (file.file_url) {
            window.open(file.file_url, '_blank');
        }
    };

     return (
        <li onClick={handleClick} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <div className="flex items-center gap-4">
                {getIcon(file.type)}
                <div>
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-sm text-gray-500">{t('common.modified')} {formatDate(file.modified_at)}</p>
                </div>
            </div>
            {file.type !== 'folder' && <span className="text-sm text-gray-500">{(file.size_kb / 1024).toFixed(1)} MB</span>}
        </li>
    );
}

export default FileItem;