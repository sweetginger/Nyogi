export default function TranslationPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Custom Translation</h1>
      <div className="max-w-4xl">
        <p className="text-muted-foreground mb-6">
          Translate text using custom translation settings.
        </p>
        <div className="border rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Source Text
              </label>
              <textarea
                className="w-full border rounded-md p-3 min-h-[150px]"
                placeholder="Enter text to translate..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Translated Text
              </label>
              <textarea
                className="w-full border rounded-md p-3 min-h-[150px] bg-muted"
                placeholder="Translation will appear here..."
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




