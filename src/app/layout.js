
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigProvider, App } from 'antd';
import "./globals.css";
import CustomDashboardLayout from "@/components/base/Layout";
import { AuthProvider } from "@/lib/AuthProvider";
import Providers from "@/components/base/providers";
import StoreProvider from "../../StoreProvider";
import { TrsutData } from "@/lib/constentData";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Custom AntD theme configuration
const theme = {
  token: {
    colorPrimary: '#8B1A1A',       // maroon – brand primary
    colorSuccess: '#2D6A1B',       // dark green
    colorWarning: '#C45E0A',       // amber-orange
    colorError:   '#dc2626',
    colorInfo:    '#8B1A1A',
    colorBorder:  '#d9b8b8',
    borderRadius: 6,
    fontFamily:   'Inter, -apple-system, sans-serif',
  },
  components: {
    Button: {
      colorPrimary:      '#8B1A1A',
      colorPrimaryHover: '#6B1010',
    },
    Menu: {
      colorItemBgSelected:     '#8B1A1A',
      colorItemTextSelected:   '#ffffff',
      colorItemTextHover:      '#8B1A1A',
      colorItemBgHover:        '#F5E6E6',
    },
    Table: {
      colorFillAlter:    '#FDF5F5',
      headerBg:          '#6B1A1A',
      headerColor:       '#ffffff',
      headerSortActiveBg:'#8B1A1A',
    },
  },
};

export const metadata = {
  title: TrsutData.name + " Admin",
  description: "A comprehensive trust management solution",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <StoreProvider>
          <ConfigProvider theme={theme}>
            <App>
                <Providers>
              <CustomDashboardLayout>
                {children}
              </CustomDashboardLayout>
                </Providers>
            </App>
          </ConfigProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
