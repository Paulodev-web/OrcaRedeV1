import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { BudgetPostDetail } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPostDisplayName(post: BudgetPostDetail | { custom_name?: string; counter?: number; name?: string }): string {
  if (!post.counter || post.counter === 0) {
    return post.name || 'Poste';
  }
  if (post.custom_name && post.custom_name.trim()) {
    return `${post.custom_name.trim()} ${post.counter.toString().padStart(2, '0')}`;
  }
  return post.counter.toString().padStart(2, '0');
}
