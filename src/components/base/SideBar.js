"use client";
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  FiGrid, FiUsers, FiSettings, FiCreditCard, FiUser,
} from 'react-icons/fi';
import { useAuth } from '@/lib/AuthProvider';
import { TrsutData } from '@/lib/constentData';

/* ── Nav items with Hindi labels ────────────────────────────────────────── */
const navItems = [
  { icon: FiGrid,       hiLabel: 'डैशबोर्ड',          label: 'Dashboard',        link: '/'                },
  { icon: FiUsers,      hiLabel: 'सदस्य प्रबंधन',     label: 'Manage Members',   link: '/members'         },
  { icon: FiUser,       hiLabel: 'एजेंट प्रबंधन',     label: 'Agent Management', link: '/agents'          },
  { icon: FiCreditCard, hiLabel: 'योजनाएं',            label: 'Schemes & Programs',link: '/yojna'          },
  { icon: FiCreditCard, hiLabel: 'बकाया भुगतान',       label: 'Closing Payments', link: '/closingPayments' },
  { icon: FiCreditCard, hiLabel: 'भुगतान इतिहास',     label: 'Payments History', link: '/transactions'    },
];

const systemItems = [
  { icon: FiSettings, hiLabel: 'सेटिंग्स', label: 'Settings', link: '/setting' },
];

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
const SideBar = ({ collapsed, onClose }) => {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (path) => path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap');

        .sb-root {
          font-family: 'Hind', 'Outfit', sans-serif;
          background: #FDF5EE;
          border-right: 1.5px solid #E8C9B0;
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
        }

        /* ── Logo / header ── */
        .sb-header {
          padding: 14px 16px 12px;
          border-bottom: 1.5px solid #E8C9B0;
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #7B1A1A 0%, #5C0F0F 100%);
          flex-shrink: 0;
        }
        .sb-logo-circle {
          width: 44px; height: 44px;
          border-radius: 50%;
          background: #fff;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid #C9A227;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .sb-org-name {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          line-height: 1.3;
          letter-spacing: 0.01em;
        }
        .sb-org-sub {
          font-size: 10px;
          color: #F5C9A0;
          letter-spacing: 0.12em;
          margin-top: 2px;
          font-family: 'Outfit', sans-serif;
          font-weight: 600;
          text-transform: uppercase;
        }

        /* ── Section ornament divider ── */
        .sb-section-label {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px 6px;
          flex-shrink: 0;
        }
        .sb-ornament-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, #C9A227, transparent);
        }
        .sb-section-text {
          font-size: 10px;
          font-weight: 700;
          color: #8B4513;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }

        /* ── Nav items ── */
        .sb-nav { flex: 1; overflow-y: auto; padding: 4px 10px 8px; }
        .sb-nav::-webkit-scrollbar { width: 3px; }
        .sb-nav::-webkit-scrollbar-thumb { background: #D9B8A0; border-radius: 99px; }

        .sb-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 10px;
          margin-bottom: 2px;
          text-decoration: none;
          border: 1px solid transparent;
          transition: all 0.18s ease;
          cursor: pointer;
        }
        .sb-item:hover {
          background: #F5E6DE;
          border-color: #E8C9B0;
        }
        .sb-item.active {
          background: linear-gradient(135deg, #8B1A1A 0%, #6B1010 100%);
          border-color: #A03030;
          box-shadow: 0 2px 10px rgba(139,26,26,0.3);
        }

        .sb-icon-wrap {
          width: 36px; height: 36px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background: #F0E0D6;
          color: #8B1A1A;
          transition: all 0.18s;
        }
        .sb-item.active .sb-icon-wrap {
          background: rgba(255,255,255,0.18);
          color: #fff;
        }
        .sb-item:not(.active):hover .sb-icon-wrap {
          background: #E8C0B0;
          color: #6B1010;
        }

        .sb-label-hi {
          font-size: 13px;
          font-weight: 600;
          color: #2C1A0E;
          line-height: 1.2;
          transition: color 0.18s;
        }
        .sb-label-en {
          font-size: 10.5px;
          color: #9C7A6A;
          font-family: 'Outfit', sans-serif;
          margin-top: 1px;
          transition: color 0.18s;
        }
        .sb-item.active .sb-label-hi { color: #fff; }
        .sb-item.active .sb-label-en { color: rgba(255,255,255,0.7); }

        /* collapsed icon only */
        .sb-item.collapsed-item {
          justify-content: center;
          padding: 10px;
        }
        .sb-item.collapsed-item .sb-icon-wrap { width: 40px; height: 40px; border-radius: 10px; }

        /* ── Footer ── */
        .sb-footer {
          border-top: 1.5px solid #E8C9B0;
          padding: 12px 14px;
          flex-shrink: 0;
          background: #FAF0E6;
        }
        .sb-user-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sb-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8B1A1A, #C45E0A);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          flex-shrink: 0;
          border: 2px solid #C9A227;
        }
        .sb-user-name {
          font-size: 13px;
          font-weight: 600;
          color: #2C1A0E;
          truncate: true;
        }
        .sb-user-email {
          font-size: 10px;
          color: #9C7A6A;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }

        /* ── Bottom decorative text ── */
        .sb-bottom-note {
          text-align: center;
          font-size: 10px;
          color: #B89080;
          padding: 6px 0 4px;
          font-style: italic;
          letter-spacing: 0.05em;
        }

        @keyframes sbSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .sb-item { animation: sbSlideIn 0.25s ease both; }
      `}</style>

      <aside className={`sb-root transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[240px]'}`}>

        {/* ── Header / Logo ── */}
        <div className="sb-header">
          <div className="sb-logo-circle">
            {TrsutData.logo
              ? <img src={TrsutData.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 20, color: '#8B1A1A', fontWeight: 700 }}>M</span>
            }
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div className="sb-org-name">{TrsutData.name || 'MHSSF'}</div>
              <div className="sb-org-sub">MHSSF-ADMIN PANEL</div>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="sb-nav">

          {/* Main menu section */}
          {!collapsed && (
            <div className="sb-section-label">
              <div className="sb-ornament-line" />
              <span className="sb-section-text">॥ मुख्य मेनू ॥</span>
              <div className="sb-ornament-line" />
            </div>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navItems.map((item, i) => {
              const Icon = item.icon;
              const active = isActive(item.link);
              return (
                <li key={i} style={{ animationDelay: `${i * 0.04}s` }}>
                  <Link
                    href={item.link}
                    onClick={onClose}
                    className={`sb-item ${active ? 'active' : ''} ${collapsed ? 'collapsed-item' : ''}`}
                    title={collapsed ? item.hiLabel : ''}
                  >
                    <div className="sb-icon-wrap">
                      <Icon size={17} />
                    </div>
                    {!collapsed && (
                      <div style={{ minWidth: 0 }}>
                        <div className="sb-label-hi">{item.hiLabel}</div>
                        <div className="sb-label-en">{item.label}</div>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* System section */}
          {!collapsed && (
            <div className="sb-section-label" style={{ marginTop: 8 }}>
              <div className="sb-ornament-line" />
              <span className="sb-section-text">॥ सिस्टम ॥</span>
              <div className="sb-ornament-line" />
            </div>
          )}
          {collapsed && <div style={{ height: 12 }} />}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {systemItems.map((item, i) => {
              const Icon = item.icon;
              const active = isActive(item.link);
              return (
                <li key={i} style={{ animationDelay: `${(navItems.length + i) * 0.04}s` }}>
                  <Link
                    href={item.link}
                    onClick={onClose}
                    className={`sb-item ${active ? 'active' : ''} ${collapsed ? 'collapsed-item' : ''}`}
                    title={collapsed ? item.hiLabel : ''}
                  >
                    <div className="sb-icon-wrap">
                      <Icon size={17} />
                    </div>
                    {!collapsed && (
                      <div style={{ minWidth: 0 }}>
                        <div className="sb-label-hi">{item.hiLabel}</div>
                        <div className="sb-label-en">{item.label}</div>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Footer / User ── */}
        <div className="sb-footer">
          <div className="sb-user-row">
            <div className="sb-avatar">
              {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
            </div>
            {!collapsed && user && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sb-user-name">{user.username || 'MHSSF-ADMIN'}</div>
                <div className="sb-user-email">{user.email || 'admin@mhssf.org'}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="sb-bottom-note">॥ श्री गणेशाय नमः ॥</div>
          )}
        </div>

      </aside>
    </>
  );
};

export default SideBar;
