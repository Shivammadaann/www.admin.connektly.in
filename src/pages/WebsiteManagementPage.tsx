import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenText,
  FileText,
  ImageUp,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { WebsiteBlogPost, WebsiteContentResponse, WebsiteHelpArticle } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/format';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';

type TabId = 'blogs' | 'help';
type TinyMceEditor = {
  getContent: () => string;
  setContent: (value: string) => void;
  on: (eventName: string, callback: () => void) => void;
  remove: () => void;
};

declare global {
  interface Window {
    tinymce?: {
      init: (options: Record<string, unknown>) => Promise<TinyMceEditor[]>;
    };
  }
}

const emptyBlogForm = {
  title: '',
  author: '',
  excerpt: '',
  coverImage: '',
  content: '',
};

const emptyHelpForm = {
  title: '',
  author: '',
  category: 'Connektly Overview',
  excerpt: '',
  content: '',
};

const inputClass =
  'w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500';

let tinymceScriptPromise: Promise<void> | null = null;

function loadTinyMce() {
  if (window.tinymce) return Promise.resolve();
  if (tinymceScriptPromise) return tinymceScriptPromise;

  tinymceScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tinymce/6.8.3/tinymce.min.js';
    script.referrerPolicy = 'origin';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('TinyMCE failed to load.'));
    document.head.appendChild(script);
  });

  return tinymceScriptPromise;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(blob);
  });
}

function resolveWebsiteUrl(value: string | null | undefined, publicBaseUrl: string) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${publicBaseUrl.replace(/\/$/, '')}${value.startsWith('/') ? value : `/${value}`}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function RichTextEditor({
  id,
  value,
  onChange,
  height = 420,
  enableToc = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  height?: number;
  enableToc?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<TinyMceEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadTinyMce();
        if (cancelled || !textareaRef.current || !window.tinymce) return;

        const editors = await window.tinymce.init({
          target: textareaRef.current,
          plugins: enableToc ? 'image table link lists code autolink toc' : 'image table link lists code autolink',
          toolbar:
            'undo redo | blocks | bold italic forecolor backcolor | alignleft aligncenter alignright | bullist numlist | table image link' +
            (enableToc ? ' toc' : '') +
            ' | removeformat code',
          menubar: enableToc ? 'file edit view insert format tools table help' : false,
          height,
          automatic_uploads: true,
          convert_urls: false,
          images_upload_handler: async (blobInfo: { blob: () => Blob; filename: () => string }) => {
            const dataUrl = await readBlobAsDataUrl(blobInfo.blob());
            const upload = await adminApi.uploadWebsiteMedia({
              fileName: blobInfo.filename(),
              dataUrl,
            });
            return upload.publicUrl || upload.location;
          },
          setup: (editor: TinyMceEditor) => {
            editorRef.current = editor;
            editor.on('init', () => editor.setContent(value || ''));
            editor.on('change keyup undo redo input', () => onChangeRef.current(editor.getContent()));
          },
        });

        editorRef.current = editors[0] || editorRef.current;
      } catch {
        if (!cancelled) setFallback(true);
      }
    };

    void init();
    return () => {
      cancelled = true;
      editorRef.current?.remove();
      editorRef.current = null;
    };
  }, [enableToc, height, id]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getContent() !== value) {
      editor.setContent(value || '');
    }
  }, [value]);

  if (fallback) {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={14}
        className={`${inputClass} min-h-[320px] font-mono text-xs leading-6`}
      />
    );
  }

  return <textarea id={id} ref={textareaRef} defaultValue={value} />;
}

function ContentList({
  activeTab,
  blogs,
  helpArticles,
  search,
  selectedId,
  onSelectBlog,
  onSelectHelp,
}: {
  activeTab: TabId;
  blogs: WebsiteBlogPost[];
  helpArticles: WebsiteHelpArticle[];
  search: string;
  selectedId: string;
  onSelectBlog: (blog: WebsiteBlogPost) => void;
  onSelectHelp: (article: WebsiteHelpArticle) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const blogRows = blogs.filter((blog) =>
    [blog.title, blog.author, blog.excerpt, stripHtml(blog.content)]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch),
  );
  const helpRows = helpArticles.filter((article) =>
    [article.title, article.author, article.category, article.excerpt, stripHtml(article.content)]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch),
  );
  const rows = activeTab === 'blogs' ? blogRows : helpRows;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
        No matching {activeTab === 'blogs' ? 'blog posts' : 'help articles'}.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeTab === 'blogs'
        ? blogRows.map((blog) => (
            <button
              key={blog.id}
              type="button"
              onClick={() => onSelectBlog(blog)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selectedId === blog.id ? 'border-[#5b45ff] bg-[#f5f3ff]' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-950">{blog.title}</p>
                  <p className="mt-1 truncate text-xs font-medium text-gray-500">By {blog.author || 'Anonymous'}</p>
                </div>
                <Pencil className="h-4 w-4 shrink-0 text-gray-400" />
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">{blog.excerpt || stripHtml(blog.content)}</p>
              <p className="mt-3 text-xs font-medium text-gray-400">{formatDateTime(blog.updatedAt || blog.date)}</p>
            </button>
          ))
        : helpRows.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => onSelectHelp(article)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selectedId === article.id ? 'border-[#5b45ff] bg-[#f5f3ff]' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-950">{article.title}</p>
                  <p className="mt-1 truncate text-xs font-medium text-gray-500">{article.category}</p>
                </div>
                <Pencil className="h-4 w-4 shrink-0 text-gray-400" />
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">{article.excerpt || stripHtml(article.content)}</p>
              <p className="mt-3 text-xs font-medium text-gray-400">{formatDateTime(article.updatedAt || article.date)}</p>
            </button>
          ))}
    </div>
  );
}

export default function WebsiteManagementPage() {
  const [data, setData] = useState<WebsiteContentResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('blogs');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [blogForm, setBlogForm] = useState(emptyBlogForm);
  const [helpForm, setHelpForm] = useState(emptyHelpForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedBlog = useMemo(() => data?.blogs.find((blog) => blog.id === selectedId) || null, [data, selectedId]);
  const selectedHelp = useMemo(() => data?.helpArticles.find((article) => article.id === selectedId) || null, [data, selectedId]);
  const publicBaseUrl = data?.publicBaseUrl || '';

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getWebsiteContent();
      setData(response);
      if (!selectedId) {
        const firstBlog = response.blogs[0];
        if (firstBlog) {
          selectBlog(firstBlog);
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load website content.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectBlog = (blog: WebsiteBlogPost) => {
    setActiveTab('blogs');
    setSelectedId(blog.id);
    setBlogForm({
      title: blog.title || '',
      author: blog.author || '',
      excerpt: blog.excerpt || '',
      coverImage: blog.coverImage || '',
      content: blog.content || '',
    });
  };

  const selectHelp = (article: WebsiteHelpArticle) => {
    setActiveTab('help');
    setSelectedId(article.id);
    setHelpForm({
      title: article.title || '',
      author: article.author || '',
      category: article.category || data?.categories[0] || emptyHelpForm.category,
      excerpt: article.excerpt || '',
      content: article.content || '',
    });
  };

  const newEntry = (tab: TabId = activeTab) => {
    setActiveTab(tab);
    setSelectedId('');
    setNotice(null);
    if (tab === 'blogs') {
      setBlogForm(emptyBlogForm);
    } else {
      setHelpForm({ ...emptyHelpForm, category: data?.categories[0] || emptyHelpForm.category });
    }
  };

  const saveBlog = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = selectedBlog
        ? await adminApi.updateWebsiteBlog(selectedBlog.id, blogForm)
        : await adminApi.createWebsiteBlog(blogForm);
      setData(response);
      const saved = response.blogs.find((blog) => blog.id === selectedBlog?.id) || response.blogs[0];
      if (saved) selectBlog(saved);
      setNotice('Blog post saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save blog post.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveHelp = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = selectedHelp
        ? await adminApi.updateWebsiteHelpArticle(selectedHelp.id, helpForm)
        : await adminApi.createWebsiteHelpArticle(helpForm);
      setData(response);
      const saved = response.helpArticles.find((article) => article.id === selectedHelp?.id) || response.helpArticles[0];
      if (saved) selectHelp(saved);
      setNotice('Help article saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save help article.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCurrent = async () => {
    if (!selectedId) return;
    const label = activeTab === 'blogs' ? selectedBlog?.title : selectedHelp?.title;
    if (!window.confirm(`Delete "${label || 'this item'}"? This removes it from the public website.`)) return;

    try {
      setIsSaving(true);
      setError(null);
      const response =
        activeTab === 'blogs'
          ? await adminApi.deleteWebsiteBlog(selectedId)
          : await adminApi.deleteWebsiteHelpArticle(selectedId);
      setData(response);
      const next = activeTab === 'blogs' ? response.blogs[0] : response.helpArticles[0];
      if (next && activeTab === 'blogs') selectBlog(next as WebsiteBlogPost);
      else if (next && activeTab === 'help') selectHelp(next as WebsiteHelpArticle);
      else newEntry(activeTab);
      setNotice('Content deleted.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete content.');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadCover = async (file: File | null) => {
    if (!file) return;
    try {
      setIsUploading(true);
      setError(null);
      const dataUrl = await readBlobAsDataUrl(file);
      const upload = await adminApi.uploadWebsiteMedia({ fileName: file.name, dataUrl });
      setBlogForm((current) => ({ ...current, coverImage: upload.location }));
      setNotice('Cover image uploaded.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload cover image.');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Website Management</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Manage public website blogs and Help Center content from the centralized Admin Control Centre.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={resolveWebsiteUrl(activeTab === 'blogs' ? '/blogs' : '/help', publicBaseUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              View public page
            </a>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {data ? (
        <div className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Blog Posts" value={formatNumber(data.summary.blogs)} detail="Public website articles" Icon={FileText} tone="violet" />
          <MetricCard label="Help Articles" value={formatNumber(data.summary.helpArticles)} detail="Knowledge base entries" Icon={BookOpenText} tone="emerald" />
          <MetricCard label="Help Categories" value={formatNumber(data.summary.helpCategories)} detail="Visible support groupings" Icon={Search} tone="sky" />
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      {data?.warnings.map((warning) => (
        <div key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warning}
        </div>
      ))}

      {data ? (
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Panel
            title="Content Library"
            description={`Generated ${formatDateTime(data.generatedAt)}`}
            action={
              <button
                type="button"
                onClick={() => newEntry(activeTab)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              {(['blogs', 'help'] as TabId[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    const first = tab === 'blogs' ? data.blogs[0] : data.helpArticles[0];
                    if (first && tab === 'blogs') selectBlog(first as WebsiteBlogPost);
                    else if (first && tab === 'help') selectHelp(first as WebsiteHelpArticle);
                    else newEntry(tab);
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    activeTab === tab ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-950'
                  }`}
                >
                  {tab === 'blogs' ? 'Blogs' : 'Help & Support'}
                </button>
              ))}
            </div>
            <label className="mb-4 block">
              <span className={labelClass}>Search</span>
              <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, author, content..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
                />
              </div>
            </label>
            <ContentList
              activeTab={activeTab}
              blogs={data.blogs}
              helpArticles={data.helpArticles}
              search={search}
              selectedId={selectedId}
              onSelectBlog={selectBlog}
              onSelectHelp={selectHelp}
            />
          </Panel>

          <Panel
            title={activeTab === 'blogs' ? (selectedBlog ? 'Edit Blog Post' : 'Create Blog Post') : selectedHelp ? 'Edit Help Article' : 'Create Help Article'}
            description={activeTab === 'blogs' ? 'Saved posts are immediately available to the public blog listing.' : 'Saved articles are immediately available in the public Help Center.'}
            action={
              <div className="flex flex-wrap gap-2">
                {selectedId ? (
                  <button
                    type="button"
                    onClick={() => void deleteCurrent()}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => (activeTab === 'blogs' ? void saveBlog() : void saveHelp())}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            }
          >
            {activeTab === 'blogs' ? (
              <div className="space-y-5">
                <label className="block">
                  <span className={labelClass}>Title</span>
                  <input
                    value={blogForm.title}
                    onChange={(event) => setBlogForm((current) => ({ ...current, title: event.target.value }))}
                    className={inputClass}
                    required
                  />
                </label>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Author</span>
                    <input
                      value={blogForm.author}
                      onChange={(event) => setBlogForm((current) => ({ ...current, author: event.target.value }))}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Cover Image</span>
                    <div className="flex items-center gap-3">
                      <input
                        value={blogForm.coverImage}
                        onChange={(event) => setBlogForm((current) => ({ ...current, coverImage: event.target.value }))}
                        className={inputClass}
                        placeholder="/uploads/image.jpg"
                      />
                      <label className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50">
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(event) => void uploadCover(event.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  </label>
                </div>
                {blogForm.coverImage ? (
                  <img
                    src={resolveWebsiteUrl(blogForm.coverImage, publicBaseUrl)}
                    alt=""
                    className="max-h-64 w-full rounded-2xl border border-gray-200 object-cover"
                  />
                ) : null}
                <label className="block">
                  <span className={labelClass}>Excerpt</span>
                  <input
                    value={blogForm.excerpt}
                    onChange={(event) => setBlogForm((current) => ({ ...current, excerpt: event.target.value }))}
                    className={inputClass}
                  />
                </label>
                <div>
                  <span className={labelClass}>Body Content</span>
                  <RichTextEditor
                    id="website-blog-content"
                    value={blogForm.content}
                    onChange={(content) => setBlogForm((current) => ({ ...current, content }))}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <label className="block">
                  <span className={labelClass}>Title</span>
                  <input
                    value={helpForm.title}
                    onChange={(event) => setHelpForm((current) => ({ ...current, title: event.target.value }))}
                    className={inputClass}
                    required
                  />
                </label>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Author</span>
                    <input
                      value={helpForm.author}
                      onChange={(event) => setHelpForm((current) => ({ ...current, author: event.target.value }))}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Category</span>
                    <select
                      value={helpForm.category}
                      onChange={(event) => setHelpForm((current) => ({ ...current, category: event.target.value }))}
                      className={inputClass}
                    >
                      {data.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className={labelClass}>Search Excerpt</span>
                  <input
                    value={helpForm.excerpt}
                    onChange={(event) => setHelpForm((current) => ({ ...current, excerpt: event.target.value }))}
                    className={inputClass}
                  />
                </label>
                <div>
                  <span className={labelClass}>Body Content</span>
                  <RichTextEditor
                    id="website-help-content"
                    value={helpForm.content}
                    onChange={(content) => setHelpForm((current) => ({ ...current, content }))}
                    enableToc
                    height={520}
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
