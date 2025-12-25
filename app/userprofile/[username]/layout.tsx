// This goes in app/userprofile/[id]/layout.tsx
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = params.id;
  
  return {
    title: `${id}'s Profile | Let's Meet`,
    description: `Check out ${id}'s profile on Let's Meet. Join the community and start learning!`,
    openGraph: {
      title: `${id} on Let's Meet`,
      description: `Follow ${id} and see their latest updates.`,
      images: [`https://ui-avatars.com/api/?name=${id}&background=0284c7&color=fff&size=512`],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${id}'s Profile`,
      description: `Join the conversation with ${id} on Let's Meet.`,
    },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}