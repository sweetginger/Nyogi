export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Settings</h1>
      <div className="max-w-2xl">
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">General</h2>
            <p className="text-sm text-muted-foreground">
              General application settings will be displayed here.
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Translation</h2>
            <p className="text-sm text-muted-foreground">
              Translation settings and preferences will be displayed here.
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Notifications</h2>
            <p className="text-sm text-muted-foreground">
              Notification preferences will be displayed here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}




